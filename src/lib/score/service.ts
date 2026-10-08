import { fetchReviewCommentsPublic } from "../agent-hub/learn/fetch";
import { extractCandidates, mineRules, type LearnedRule } from "../agent-hub/learn/mine";
import { fetchPublicSnapshot, ScanError, type RepoMeta } from "../agent-hub/scan/github";
import { scoreSnapshot, type ScoreReport } from "../agent-hub/scan/score";
import { TEMPLATE_CONTENT_VERSION } from "../agent-hub/version";
import { cacheGet, cacheKey, cacheSet, recordScore, repoKeyOf, takeToken, type HistoryPoint } from "./store";

/**
 * The public scoring pipeline: validate → cache → rate-limit → fetch a snapshot of the repo → score it →
 * (optionally) mine review rules → record history. Everything expensive sits behind the cache and the
 * limiter, so a popular badge or a hostile caller costs a bounded amount of GitHub API quota.
 */

const SCAN_TOKEN = process.env.SCAN_GITHUB_TOKEN || undefined;
const CACHE_TTL_SECONDS = 15 * 60;
const PER_IP_PER_MINUTE = 10;
const GLOBAL_PER_MINUTE = 90;

export type ScoreResult = {
  meta: RepoMeta;
  report: ScoreReport;
  /** Rules mined from recent trusted-reviewer comments (empty unless `withRules`). */
  rules: LearnedRule[];
  rulesChecked: boolean;
  /** What the miner looked at, so "no rules found" can say how much it actually read. */
  ruleStats: { comments: number; fromMaintainers: number; candidates: number } | null;
  history: HistoryPoint[];
  scannedAt: number;
  cached: boolean;
};

type CachedEntry = Omit<ScoreResult, "cached">;

export async function scoreRepo(owner: string, repo: string, opts: { ip?: string; withRules?: boolean } = {}): Promise<ScoreResult> {
  const repoKey = repoKeyOf(owner, repo);
  const wantRules = Boolean(opts.withRules);

  const hit = await cacheGet<CachedEntry>(cacheKey(repoKey));
  if (hit && (!wantRules || hit.rulesChecked)) return { ...hit, cached: true };

  // Only uncached work is metered: per caller, and globally as a backstop for the shared GitHub quota.
  if (opts.ip && !(await takeToken(`scan:ip:${opts.ip}`, PER_IP_PER_MINUTE, 60))) {
    throw new ScanError("rate-limited", "You're scanning too fast — wait a minute and try again.");
  }
  if (!(await takeToken("scan:global", GLOBAL_PER_MINUTE, 60))) {
    throw new ScanError("rate-limited", "The scanner is busy right now. Try again in a minute.");
  }

  const { meta, snapshot } = await fetchPublicSnapshot(owner, repo, SCAN_TOKEN);
  const report = scoreSnapshot(snapshot);

  let rules: LearnedRule[] = [];
  let ruleStats: CachedEntry["ruleStats"] = null;
  if (wantRules) {
    try {
      const comments = await fetchReviewCommentsPublic(owner, repo, SCAN_TOKEN);
      rules = mineRules(comments);
      ruleStats = { comments: comments.length, fromMaintainers: comments.filter((c) => c.trusted && !c.authorIsBot && !c.isReply).length, candidates: extractCandidates(comments).length };
    } catch {
      rules = []; // optional extra — never fail the score because review comments couldn't be read
    }
  }

  const scannedAt = Date.now();
  const history = await recordScore(repoKey, { t: scannedAt, total: report.total, rubric: report.rubric, contentVersion: TEMPLATE_CONTENT_VERSION });
  const entry: CachedEntry = { meta, report, rules, rulesChecked: wantRules, ruleStats, history, scannedAt };
  await cacheSet(cacheKey(repoKey), entry, CACHE_TTL_SECONDS);
  return { ...entry, cached: false };
}

export { ScanError };
