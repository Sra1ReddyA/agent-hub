import { MAX_FILE_CHARS, selectFilesToRead } from "./select";
import type { RepoSnapshot } from "./types";

/**
 * Builds a `RepoSnapshot` of a PUBLIC GitHub repository using only GitHub's REST API (one call for repo
 * metadata, one for the whole file tree) plus raw.githubusercontent.com for the few files worth reading.
 * Both hosts are fixed constants and the owner / repo are validated against GitHub's own naming rules
 * before they go anywhere near a URL, so there is no way to steer these requests at another host (SSRF).
 */

export type RepoMeta = {
  fullName: string;
  defaultBranch: string;
  description: string | null;
  stars: number;
  archived: boolean;
  isPrivate: boolean;
  pushedAt: string | null;
};

export type ScanErrorCode = "invalid" | "not-found" | "rate-limited" | "upstream";

export class ScanError extends Error {
  constructor(
    public code: ScanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_READ_BYTES = 200_000;
const FETCH_TIMEOUT_MS = 9000;

/** Accepts `owner/repo`, `github.com/owner/repo` or a full github.com URL; returns null for anything else. */
export function parseRepoRef(input: string): { owner: string; repo: string } | null {
  let s = input.trim();
  if (!s || s.length > 200) return null;
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[?#]/)[0];
  const parts = s.split("/");
  if (/^github\.com$/i.test(parts[0])) parts.shift();
  else if (parts[0].includes(".")) return null; // GitHub owners can't contain dots, so this is some other host
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agent-hub-score",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghJson<T>(path: string, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: headers(token), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new ScanError("upstream", "GitHub didn't respond in time. Try again in a moment.");
  }
  if (res.status === 404) throw new ScanError("not-found", "Repository not found — it may be private, renamed or misspelled. Only public repositories can be scanned here.");
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || res.status === 429) throw new ScanError("rate-limited", "GitHub's rate limit was reached. Try again in a few minutes.");
    throw new ScanError("upstream", "GitHub refused the request (HTTP 403).");
  }
  if (!res.ok) throw new ScanError("upstream", `GitHub returned HTTP ${res.status}.`);
  return (await res.json()) as T;
}

type ApiRepo = { full_name: string; default_branch: string; description: string | null; stargazers_count: number; archived: boolean; private: boolean; pushed_at: string | null };
type ApiTree = { tree: { path: string; type: string; size?: number }[]; truncated: boolean };

async function rawText(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const url = `${RAW}/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "agent-hub-score" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) : text;
  } catch {
    return null;
  }
}

export async function fetchPublicSnapshot(owner: string, repo: string, token?: string): Promise<{ meta: RepoMeta; snapshot: RepoSnapshot }> {
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) throw new ScanError("invalid", "That doesn't look like a valid owner/repo.");

  const r = await ghJson<ApiRepo>(`/repos/${owner}/${repo}`, token);
  if (r.private) throw new ScanError("not-found", "Only public repositories can be scanned here.");
  const meta: RepoMeta = {
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    description: r.description,
    stars: r.stargazers_count,
    archived: r.archived,
    isPrivate: r.private,
    pushedAt: r.pushed_at,
  };

  const tree = await ghJson<ApiTree>(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(r.default_branch)}?recursive=1`, token);
  const blobs = tree.tree.filter((e) => e.type === "blob");
  const sizes = new Map(blobs.map((e) => [e.path, e.size ?? 0]));
  const paths = blobs.map((e) => e.path);
  const toRead = selectFilesToRead(paths).filter((p) => (sizes.get(p) ?? 0) <= MAX_READ_BYTES);

  const files: Record<string, string> = {};
  for (let i = 0; i < toRead.length; i += 12) {
    const batch = toRead.slice(i, i + 12);
    const texts = await Promise.all(batch.map((p) => rawText(owner, repo, r.default_branch, p)));
    batch.forEach((p, idx) => {
      const t = texts[idx];
      if (t !== null) files[p] = t;
    });
  }
  return { meta, snapshot: { paths, files, truncated: tree.truncated } };
}
