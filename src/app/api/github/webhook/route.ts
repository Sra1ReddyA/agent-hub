import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MODE, DEFAULT_TARGETS } from "@/lib/agent-hub/generator";
import { getApp } from "@/lib/github-app/client";
import { BOT_LOGIN, GITHUB_APP_CONFIGURED } from "@/lib/github-app/env";
import { getRepoConfig, isRedisConfigured, removeInstallation, removeRepoConfig, saveRepoConfig, type RepoConfig } from "@/lib/github-app/repoConfigStore";
import { syncRepo } from "@/lib/github-app/sync";

export const runtime = "nodejs";

/** GitHub's webhook payload types are large and only partially used here — narrow, ad-hoc shapes for just
 * the fields this handler reads keep this file readable without pulling in `@octokit/webhooks-types`. */
type RepoRef = { id: number; name: string; full_name: string };

function defaultConfig(installationId: number, repo: RepoRef, defaultBranch: string): RepoConfig {
  return {
    installationId,
    repoFullName: repo.full_name,
    defaultBranch,
    stackIds: [],
    mode: DEFAULT_MODE,
    targetIds: DEFAULT_TARGETS,
    includeCiCheck: false,
    lastSyncedContentVersion: null,
    lastSyncedAt: null,
    lastPrUrl: null,
  };
}

let handlersRegistered = false;

/** Registers the event handlers on the shared `App`'s webhooks emitter exactly once per process — the
 * route below calls this before every `verifyAndReceive`, but re-registering on an already-wired emitter
 * would just mean the same event fires its handler twice, so this guard is a correctness requirement, not
 * an optimization. */
function ensureHandlersRegistered() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  const app = getApp();

  app.webhooks.on("installation.created", async ({ payload }) => {
    if (!isRedisConfigured()) return;
    const repos = (payload.repositories ?? []) as RepoRef[];
    for (const repo of repos) {
      // The webhook payload's repository list doesn't include the default branch — fetch it once per repo.
      const octokit = await app.getInstallationOctokit(payload.installation.id);
      const [owner, name] = repo.full_name.split("/");
      const { data } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo: name });
      const config = defaultConfig(payload.installation.id, repo, data.default_branch);
      await saveRepoConfig(config);
      await syncRepo(config); // zero-config first sync, so installing the App alone is enough to see it work
    }
  });

  app.webhooks.on("installation.deleted", async ({ payload }) => {
    if (!isRedisConfigured()) return;
    await removeInstallation(payload.installation.id);
  });

  app.webhooks.on("installation_repositories.added", async ({ payload }) => {
    if (!isRedisConfigured()) return;
    const repos = payload.repositories_added as RepoRef[];
    const octokit = await app.getInstallationOctokit(payload.installation.id);
    for (const repo of repos) {
      const [owner, name] = repo.full_name.split("/");
      const { data } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo: name });
      const config = defaultConfig(payload.installation.id, repo, data.default_branch);
      await saveRepoConfig(config);
      await syncRepo(config);
    }
  });

  app.webhooks.on("installation_repositories.removed", async ({ payload }) => {
    if (!isRedisConfigured()) return;
    const repos = payload.repositories_removed as RepoRef[];
    for (const repo of repos) await removeRepoConfig(payload.installation.id, repo.full_name);
  });

  app.webhooks.on("push", async ({ payload }) => {
    if (!isRedisConfigured()) return;
    const repo = payload.repository;
    if (!repo || payload.ref !== `refs/heads/${repo.default_branch}`) return; // ignore pushes to any other branch, including our own sync branch
    if (BOT_LOGIN && payload.pusher?.name === BOT_LOGIN) return; // extra guard against reacting to our own commits
    if (!payload.installation) return;

    let config = await getRepoConfig(payload.installation.id, repo.full_name);
    if (!config) {
      config = defaultConfig(payload.installation.id, { id: repo.id, name: repo.name, full_name: repo.full_name }, repo.default_branch);
    } else {
      config = { ...config, defaultBranch: repo.default_branch };
    }
    await syncRepo(config);
  });
}

export async function POST(req: NextRequest) {
  if (!GITHUB_APP_CONFIGURED) {
    return new NextResponse("Agent Hub Sync isn't configured on this deployment.", { status: 503 });
  }

  const id = req.headers.get("x-github-delivery") ?? "";
  const name = req.headers.get("x-github-event") ?? "";
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const payload = await req.text();

  try {
    ensureHandlersRegistered();
    // `verifyAndReceive` checks `signature` against the raw `payload` with the app's webhook secret before
    // dispatching to any handler above — an unsigned or mis-signed request never reaches repo-mutating code.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getApp().webhooks.verifyAndReceive({ id, name: name as any, signature, payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A bad signature is the expected shape of "someone poked this URL without the secret" — 400, not 500,
    // and never let a handler-thrown error take the whole webhook delivery down as a 5xx GitHub will retry.
    return new NextResponse(`Webhook error: ${message}`, { status: 400 });
  }

  return new NextResponse(null, { status: 204 });
}
