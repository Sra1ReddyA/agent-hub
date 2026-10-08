import { toReviewComment, type ApiComment } from "../agent-hub/learn/fetch";
import { mineRules, ruleLine, type ReviewComment } from "../agent-hub/learn/mine";
import { MAX_FILE_CHARS, selectFilesToRead } from "../agent-hub/scan/select";
import type { RepoSnapshot } from "../agent-hub/scan/types";
import type { GeneratedFile } from "../agent-hub/types";
import type { getInstallationOctokit } from "./client";

type Octokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

const MAX_READ_BYTES = 200_000;

/** The installation-authenticated twin of `scan/github.ts`'s public fetcher: same snapshot shape (so Sync scores
 * a repo exactly like the website does), but through the GitHub App's own credentials so private repositories
 * work. One call for the whole tree, then one blob request per file worth reading (≤ ~56). */
export async function fetchSnapshot(octokit: Octokit, owner: string, repo: string, ref: string): Promise<RepoSnapshot> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", { owner, repo, tree_sha: ref, recursive: "1" });
  const blobs = data.tree.filter((e) => e.type === "blob" && typeof e.path === "string");
  const meta = new Map(blobs.map((e) => [e.path as string, { sha: e.sha as string, size: e.size ?? 0 }]));
  const paths = [...meta.keys()];
  const toRead = selectFilesToRead(paths).filter((p) => (meta.get(p)?.size ?? 0) <= MAX_READ_BYTES);

  const files: Record<string, string> = {};
  for (let i = 0; i < toRead.length; i += 10) {
    const batch = toRead.slice(i, i + 10);
    const texts = await Promise.all(
      batch.map(async (p) => {
        try {
          const res = await octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", { owner, repo, file_sha: meta.get(p)!.sha });
          if (res.data.encoding !== "base64") return null;
          const text = Buffer.from(res.data.content, "base64").toString("utf-8");
          return text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) : text;
        } catch {
          return null; // one unreadable file just means one fewer signal
        }
      }),
    );
    batch.forEach((p, idx) => {
      if (texts[idx] !== null) files[p] = texts[idx]!;
    });
  }
  return { paths, files, truncated: Boolean(data.truncated) };
}

/** Returns the snapshot as it would look once `generated` files were committed — used to project the score a
 * Sync pull request will produce, without applying anything. */
export function overlayFiles(snapshot: RepoSnapshot, generated: GeneratedFile[]): RepoSnapshot {
  const paths = new Set(snapshot.paths);
  const files = { ...snapshot.files };
  for (const f of generated) {
    paths.add(f.path);
    files[f.path] = f.content;
  }
  return { paths: [...paths], files, truncated: snapshot.truncated };
}

/** Recent review comments → mined, formatted rule lines. Best effort: any failure (permissions, rate limit,
 * network) yields no rules rather than failing the sync. */
export async function learnRules(octokit: Octokit, owner: string, repo: string): Promise<string[]> {
  const comments: ReviewComment[] = [];
  try {
    for (let page = 1; page <= 8; page++) {
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls/comments", { owner, repo, per_page: 100, sort: "created", direction: "desc", page });
      comments.push(...(data as unknown as ApiComment[]).map(toReviewComment));
      if (data.length < 100) break;
    }
  } catch {
    return [];
  }
  return mineRules(comments).map(ruleLine);
}
