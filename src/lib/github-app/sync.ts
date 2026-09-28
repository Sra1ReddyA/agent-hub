import { buildBundle } from "../agent-hub/generator";
import { detectStacksFromManifest } from "../agent-hub/detect";
import { CHANGELOG, TEMPLATE_CONTENT_VERSION } from "../agent-hub/version";
import { getInstallationOctokit } from "./client";
import { type RepoConfig, type SyncStatus, saveRepoConfig } from "./repoConfigStore";

type Octokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

const SYNC_BRANCH = "agent-hub-sync";

// Root-level filenames (or suffixes, for the ones ending in "*") whose content is worth feeding to
// `detectStacksFromManifest` — mirrors what a visitor would paste into the site's manifest-paste box,
// just fetched automatically instead of by hand. Root-only and heuristic on purpose: a full recursive
// repo scan is a lot more API calls for very little extra signal over the manifests everyone keeps at
// their repo root.
const MANIFEST_NAMES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "pubspec.yaml",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
];
const MANIFEST_SUFFIXES = [".csproj"];

async function fetchManifestText(octokit: Octokit, owner: string, repo: string, ref: string): Promise<string> {
  let entries: { name: string; type: string }[] = [];
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path: "", ref });
    entries = Array.isArray(res.data) ? (res.data as { name: string; type: string }[]) : [];
  } catch {
    return "";
  }

  const candidates = entries.filter(
    (e) => e.type === "file" && (MANIFEST_NAMES.includes(e.name) || MANIFEST_SUFFIXES.some((suf) => e.name.endsWith(suf))),
  );

  const texts = await Promise.all(
    candidates.map(async (e) => {
      try {
        const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path: e.name, ref });
        const data = res.data as { content?: string; encoding?: string };
        if (data.content && data.encoding === "base64") return Buffer.from(data.content, "base64").toString("utf-8");
      } catch {
        // A manifest disappearing between listing and fetch, or a permissions quirk, isn't fatal — just
        // means one fewer signal for this run.
      }
      return "";
    }),
  );
  return texts.join("\n");
}

async function getExistingFileContent(octokit: Octokit, owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path, ref });
    const data = res.data as { content?: string; encoding?: string };
    if (data.content && data.encoding === "base64") return Buffer.from(data.content, "base64").toString("utf-8");
    return null;
  } catch {
    return null; // file doesn't exist yet on this branch — fine, it'll be created
  }
}

function summarizePrBody(config: RepoConfig, newStacks: string[], addedStacks: string[]): string {
  const since = config.lastSyncedContentVersion;
  const relevantEntries = since ? CHANGELOG.filter((c) => c.contentChange && isNewer(c.version, since)) : CHANGELOG.filter((c) => c.contentChange).slice(0, 1);

  const lines: string[] = [
    "Opened automatically by **Agent Hub Sync** because ",
    addedStacks.length > 0
      ? `your repository's manifests now show ${addedStacks.join(", ")} in addition to what was already tracked, and/or `
      : "",
    "Agent Hub's generated guardrails were updated since the last sync.",
    "",
    `**Stacks now tracked:** ${newStacks.join(", ")}`,
    "",
    "**What changed in the generated content:**",
  ];
  if (relevantEntries.length === 0) {
    lines.push("- Refreshed to the current template output (no content-changing release since the last sync — this run picked up the newly detected stack(s) instead).");
  } else {
    for (const entry of relevantEntries) {
      lines.push(`- **v${entry.version}** (${entry.date}) — ${entry.title}`);
      for (const c of entry.changes) lines.push(`  - ${c}`);
    }
  }
  lines.push(
    "",
    "Review the diff like any other PR — nothing here is force-pushed to your default branch, and Agent Hub never touches this repository outside of this one branch. Edit, request changes, or close it; your edits on this branch are preserved the next time nothing else has changed.",
    "",
    `_Agent Hub Sync · content v${TEMPLATE_CONTENT_VERSION} · [what changed](https://agent-hub.dev/changelog)_`,
  );
  return lines.filter((l) => l !== "").join("\n");
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

export type SyncResult =
  | { status: "up-to-date" }
  | { status: "no-manifest-signal" }
  | { status: "pr-opened" | "pr-updated"; url: string; changedFiles: string[] }
  | { status: "error"; message: string };

/** Records the outcome of a run on the config itself — `lastSyncedAt`/`lastSyncStatus`/`lastSyncError` —
 * regardless of whether anything actually changed, so `/admin/sync` can show "checked 4 minutes ago, no
 * changes" rather than going silent on every no-op run. Best-effort: a failure here shouldn't turn a real
 * result into an error, since the caller (webhook/cron) already logs the actual `SyncResult` separately. */
async function recordOutcome(config: RepoConfig, status: SyncStatus, error: string | null, extra: Partial<RepoConfig> = {}) {
  try {
    await saveRepoConfig({ ...config, ...extra, lastSyncedAt: Date.now(), lastSyncStatus: status, lastSyncError: error });
  } catch {
    // Redis hiccup on the bookkeeping write — the sync itself (and its logged result) already happened.
  }
}

/** The whole point of Agent Hub Sync in one function: re-detect the repo's stack, rebuild the bundle
 * against the latest template content, diff it against what's actually committed, and — only if something
 * really changed — push a commit to a dedicated `agent-hub-sync` branch and open (or silently update) one
 * PR. Never touches the default branch directly. Safe to call repeatedly (from a push webhook or the
 * daily cron sweep): it's a no-op whenever nothing has changed. */
export async function syncRepo(config: RepoConfig): Promise<SyncResult> {
  const [owner, repo] = config.repoFullName.split("/");
  try {
    const octokit = await getInstallationOctokit(config.installationId);

    const manifestText = await fetchManifestText(octokit, owner, repo, config.defaultBranch);
    const detected = manifestText ? detectStacksFromManifest(manifestText) : [];
    const mergedStacks = [...new Set([...config.stackIds, ...detected])];
    const addedStacks = detected.filter((id) => !config.stackIds.includes(id));

    if (mergedStacks.length === 0) {
      await recordOutcome(config, "no-manifest-signal", null);
      return { status: "no-manifest-signal" };
    }

    const versionUnchanged = config.lastSyncedContentVersion === TEMPLATE_CONTENT_VERSION;
    const stacksUnchanged = addedStacks.length === 0;
    if (versionUnchanged && stacksUnchanged) {
      await recordOutcome(config, "up-to-date", null);
      return { status: "up-to-date" };
    }

    const files = buildBundle(mergedStacks, config.targetIds, config.mode, {
      customRules: config.customRules,
      includeCiCheck: config.includeCiCheck,
    });

    // Diff against what's actually on the default branch right now — only files that actually changed
    // go into the commit, so the PR's diff is exactly what a human would expect, not a full rewrite.
    const existing = await Promise.all(files.map((f) => getExistingFileContent(octokit, owner, repo, f.path, config.defaultBranch)));
    const changed = files.filter((f, i) => existing[i] !== f.content);

    if (changed.length === 0) {
      await recordOutcome(config, "up-to-date", null, { stackIds: mergedStacks, lastSyncedContentVersion: TEMPLATE_CONTENT_VERSION });
      return { status: "up-to-date" };
    }

    const { data: ref } = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: `heads/${config.defaultBranch}` });
    const baseSha = ref.object.sha;
    const { data: baseCommit } = await octokit.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", { owner, repo, commit_sha: baseSha });

    const blobs = await Promise.all(
      changed.map(async (f) => {
        const { data: blob } = await octokit.request("POST /repos/{owner}/{repo}/git/blobs", { owner, repo, content: f.content, encoding: "utf-8" });
        return { path: f.path, sha: blob.sha };
      }),
    );

    const { data: tree } = await octokit.request("POST /repos/{owner}/{repo}/git/trees", {
      owner,
      repo,
      base_tree: baseCommit.tree.sha,
      tree: blobs.map((b) => ({ path: b.path, mode: "100644" as const, type: "blob" as const, sha: b.sha })),
    });

    const commitMessage = `chore: sync AI agent guardrails (Agent Hub v${TEMPLATE_CONTENT_VERSION})\n\n${changed.map((f) => `- ${f.path}`).join("\n")}`;
    const { data: commit } = await octokit.request("POST /repos/{owner}/{repo}/git/commits", {
      owner,
      repo,
      message: commitMessage,
      tree: tree.sha,
      parents: [baseSha],
    });

    let branchExists = true;
    try {
      await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: `heads/${SYNC_BRANCH}` });
    } catch {
      branchExists = false;
    }
    if (branchExists) {
      await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", { owner, repo, ref: `heads/${SYNC_BRANCH}`, sha: commit.sha, force: true });
    } else {
      await octokit.request("POST /repos/{owner}/{repo}/git/refs", { owner, repo, ref: `refs/heads/${SYNC_BRANCH}`, sha: commit.sha });
    }

    const prBody = summarizePrBody(config, mergedStacks, addedStacks);
    const openPrs = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      state: "open",
      head: `${owner}:${SYNC_BRANCH}`,
      base: config.defaultBranch,
    });

    let prUrl: string;
    let status: "pr-opened" | "pr-updated";
    if (openPrs.data.length > 0) {
      const pr = openPrs.data[0];
      await octokit.request("PATCH /repos/{owner}/{repo}/pulls/{pull_number}", { owner, repo, pull_number: pr.number, body: prBody });
      prUrl = pr.html_url;
      status = "pr-updated";
    } else {
      const { data: pr } = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
        owner,
        repo,
        title: `Sync AI agent guardrails (Agent Hub v${TEMPLATE_CONTENT_VERSION})`,
        head: SYNC_BRANCH,
        base: config.defaultBranch,
        body: prBody,
      });
      prUrl = pr.html_url;
      status = "pr-opened";
    }

    await recordOutcome(config, status, null, {
      stackIds: mergedStacks,
      lastSyncedContentVersion: TEMPLATE_CONTENT_VERSION,
      lastPrUrl: prUrl,
    });

    return { status, url: prUrl, changedFiles: changed.map((f) => f.path) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordOutcome(config, "error", message);
    return { status: "error", message };
  }
}
