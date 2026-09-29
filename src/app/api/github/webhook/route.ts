import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MODE, DEFAULT_TARGETS } from "@/lib/agent-hub/generator";
import { getApp, type InstallationOctokit } from "@/lib/github-app/client";
import { BOT_LOGIN, GITHUB_APP_CONFIGURED } from "@/lib/github-app/env";
import { getRepoConfig, isRedisConfigured, removeInstallation, removeRepoConfig, saveRepoConfig, type RepoConfig } from "@/lib/github-app/repoConfigStore";
import { syncRepo, type SyncResult } from "@/lib/github-app/sync";

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
    lastSyncedConfigFingerprint: null,
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    lastPrUrl: null,
  };
}

/** `installation.created`'s payload documents `repositories` as "an array of repository objects the
 * installation can access," but that's undocumented for the "all repositories" install scope specifically
 * — rather than depend on payload behavior GitHub doesn't pin down, ask the installation's own token what
 * it can see. Also the fallback if a payload's `repositories` array ever comes back empty for any reason. */
async function listAccessibleRepos(octokit: InstallationOctokit): Promise<RepoRef[]> {
  const repos: RepoRef[] = [];
  let page = 1;
  for (;;) {
    const { data } = await octokit.request("GET /installation/repositories", { per_page: 100, page });
    repos.push(...data.repositories.map((r) => ({ id: Number(r.id), name: r.name, full_name: r.full_name })));
    if (data.repositories.length < 100) break;
    page += 1;
  }
  return repos;
}

/** Every per-repo sync outcome is logged (Vercel's function logs) so a silent no-op — no PR, no thrown
 * error — is still diagnosable after the fact instead of leaving no trace anywhere. */
function logSyncResult(repoFullName: string, result: SyncResult) {
  if (result.status === "error") {
    console.error(`[agent-hub-sync] ${repoFullName}: ${result.status} — ${result.message}`);
  } else if (result.status === "pr-opened" || result.status === "pr-updated") {
    console.log(`[agent-hub-sync] ${repoFullName}: ${result.status} — ${result.url} (${result.changedFiles.join(", ")})`);
  } else {
    console.log(`[agent-hub-sync] ${repoFullName}: ${result.status}`);
  }
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
    console.log(`[agent-hub-sync] installation.created for installation ${payload.installation.id}, redis=${isRedisConfigured()}`);
    if (!isRedisConfigured()) return;
    const octokit = await app.getInstallationOctokit(payload.installation.id);
    let repos = (payload.repositories ?? []) as RepoRef[];
    if (repos.length === 0) repos = await listAccessibleRepos(octokit); // see listAccessibleRepos's doc comment
    console.log(`[agent-hub-sync] installation.created: ${repos.length} repo(s) to sync — ${repos.map((r) => r.full_name).join(", ") || "(none)"}`);

    for (const repo of repos) {
      try {
        // The webhook payload's repository list doesn't include the default branch — fetch it once per repo.
        const [owner, name] = repo.full_name.split("/");
        const { data } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo: name });
        const config = defaultConfig(payload.installation.id, repo, data.default_branch);
        await saveRepoConfig(config);
        const result = await syncRepo(config); // zero-config first sync, so installing the App alone is enough to see it work
        logSyncResult(repo.full_name, result);
      } catch (err) {
        // One repo failing (e.g. an unusual permission edge case) shouldn't stop the rest of a multi-repo
        // install from syncing, and shouldn't turn into an opaque 400 for the whole webhook delivery either.
        console.error(`[agent-hub-sync] ${repo.full_name}: threw during installation.created —`, err);
      }
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
      try {
        const [owner, name] = repo.full_name.split("/");
        const { data } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo: name });
        const config = defaultConfig(payload.installation.id, repo, data.default_branch);
        await saveRepoConfig(config);
        const result = await syncRepo(config);
        logSyncResult(repo.full_name, result);
      } catch (err) {
        console.error(`[agent-hub-sync] ${repo.full_name}: threw during installation_repositories.added —`, err);
      }
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
    if (!repo || payload.ref !== `refs/heads/${repo.default_branch}`) {
      console.log(`[agent-hub-sync] push ignored: ref=${payload.ref} default=${repo?.default_branch}`);
      return; // ignore pushes to any other branch, including our own sync branch
    }
    if (BOT_LOGIN && payload.pusher?.name === BOT_LOGIN) return; // extra guard against reacting to our own commits
    if (!payload.installation) return;

    let config = await getRepoConfig(payload.installation.id, repo.full_name);
    if (!config) {
      config = defaultConfig(payload.installation.id, { id: repo.id, name: repo.name, full_name: repo.full_name }, repo.default_branch);
    } else {
      config = { ...config, defaultBranch: repo.default_branch };
    }
    try {
      const result = await syncRepo(config);
      logSyncResult(repo.full_name, result);
    } catch (err) {
      console.error(`[agent-hub-sync] ${repo.full_name}: threw during push —`, err);
    }
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
