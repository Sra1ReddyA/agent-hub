import type { ReviewComment } from "./mine";

/**
 * Fetches recent pull-request review comments for a repo through GitHub's REST API (public repos need no
 * credentials; an optional token only raises the rate limit). Repo-level listing: one request returns up to
 * 100 comments across all PRs, newest first. Owner/repo are validated by the callers (`parseRepoRef`) and the
 * host is a constant, so nothing user-supplied can redirect this request.
 */

type ApiComment = {
  id: number;
  body: string;
  path?: string;
  user: { login: string; type: string } | null;
  author_association: string;
  pull_request_url: string;
  in_reply_to_id?: number;
};

const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function toReviewComment(c: ApiComment): ReviewComment {
  const login = c.user?.login ?? "ghost";
  return {
    id: c.id,
    body: c.body ?? "",
    path: c.path,
    authorLogin: login,
    authorIsBot: c.user?.type === "Bot" || /\[bot\]$/i.test(login),
    trusted: TRUSTED.has(c.author_association),
    prKey: c.pull_request_url,
    isReply: c.in_reply_to_id != null,
  };
}

export async function fetchReviewCommentsPublic(owner: string, repo: string, token?: string, pages = 4): Promise<ReviewComment[]> {
  const out: ReviewComment[] = [];
  for (let page = 1; page <= pages; page++) {
    let res: Response;
    try {
      res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/comments?per_page=100&sort=created&direction=desc&page=${page}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "agent-hub-score",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
      });
    } catch {
      break;
    }
    if (!res.ok) break;
    const data = (await res.json()) as ApiComment[];
    out.push(...data.map(toReviewComment));
    if (data.length < 100) break;
  }
  return out;
}

export type { ApiComment };
