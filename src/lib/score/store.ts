import { Redis } from "@upstash/redis";

/**
 * Small persistence layer for the public scorer: a result cache (so a README badge viewed thousands of times
 * costs one scan, not thousands), score history (so "measure the result" has a baseline to compare against),
 * and a fixed-window rate limiter (so nobody can use this endpoint to burn the GitHub API quota).
 *
 * Uses Upstash Redis when configured and falls back to an in-process store otherwise, so local development
 * and fresh clones work with zero setup. The fallback is anchored on `globalThis` for the same reason as
 * `analytics/store.ts` (Next compiles routes and pages into separate module layers). It resets on restart and
 * isn't shared across serverless instances — fine for dev, and the limiter/cache degrade gracefully (each
 * instance enforces its own budget) rather than failing.
 */

const KV_CONFIGURED = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const kv = KV_CONFIGURED ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }) : null;

type Mem = {
  kv: Map<string, { value: string; expires: number | null }>;
  lists: Map<string, string[]>;
  counters: Map<string, { n: number; expires: number }>;
};
const g = globalThis as unknown as { __ahScoreMem?: Mem };
const mem: Mem = (g.__ahScoreMem ??= { kv: new Map(), lists: new Map(), counters: new Map() });

const MEM_MAX_KEYS = 500;
function trimMem() {
  while (mem.kv.size > MEM_MAX_KEYS) mem.kv.delete(mem.kv.keys().next().value as string);
  while (mem.lists.size > MEM_MAX_KEYS) mem.lists.delete(mem.lists.keys().next().value as string);
  while (mem.counters.size > MEM_MAX_KEYS) mem.counters.delete(mem.counters.keys().next().value as string);
}

export const cacheKey = (repoKey: string) => `ah:score:cache:${repoKey}`;
export const historyKey = (repoKey: string) => `ah:score:hist:${repoKey}`;

/** Case-insensitive, stable key for a repo. */
export const repoKeyOf = (owner: string, repo: string) => `${owner}/${repo}`.toLowerCase();

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (kv) return (await kv.get<T>(key)) ?? null;
  } catch {
    return null;
  }
  const hit = mem.kv.get(key);
  if (!hit) return null;
  if (hit.expires && hit.expires < Date.now()) {
    mem.kv.delete(key);
    return null;
  }
  return JSON.parse(hit.value) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    if (kv) {
      await kv.set(key, value, { ex: ttlSeconds });
      return;
    }
  } catch {
    return; // a cache write failing must never fail the request
  }
  mem.kv.set(key, { value: JSON.stringify(value), expires: Date.now() + ttlSeconds * 1000 });
  trimMem();
}

export type HistoryPoint = { t: number; total: number; rubric: number; contentVersion: string };

const HISTORY_MAX = 60;
const HISTORY_MIN_GAP_MS = 6 * 60 * 60 * 1000;

export async function getHistory(repoKey: string): Promise<HistoryPoint[]> {
  const key = historyKey(repoKey);
  try {
    if (kv) {
      const raw = await kv.lrange<HistoryPoint | string>(key, 0, HISTORY_MAX - 1);
      return raw.map((r) => (typeof r === "string" ? (JSON.parse(r) as HistoryPoint) : r)).reverse(); // oldest first
    }
  } catch {
    return [];
  }
  return (mem.lists.get(key) ?? []).map((r) => JSON.parse(r) as HistoryPoint).reverse();
}

/** Appends a point if the score changed or the last point is old enough — so history shows real movement, not
 * one identical row per page view. Returns the full (oldest-first) history after the write. */
export async function recordScore(repoKey: string, point: HistoryPoint): Promise<HistoryPoint[]> {
  const existing = await getHistory(repoKey);
  const last = existing[existing.length - 1];
  const worthRecording = !last || last.total !== point.total || last.rubric !== point.rubric || point.t - last.t > HISTORY_MIN_GAP_MS;
  if (!worthRecording) return existing;
  const key = historyKey(repoKey);
  try {
    if (kv) {
      await kv.lpush(key, JSON.stringify(point));
      await kv.ltrim(key, 0, HISTORY_MAX - 1);
      return [...existing, point].slice(-HISTORY_MAX);
    }
  } catch {
    return existing;
  }
  const list = mem.lists.get(key) ?? [];
  list.unshift(JSON.stringify(point));
  mem.lists.set(key, list.slice(0, HISTORY_MAX));
  trimMem();
  return [...existing, point].slice(-HISTORY_MAX);
}

/** Fixed-window counter. Returns true while the caller is within `limit` hits per `windowSeconds`. */
export async function takeToken(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `ah:rl:${bucket}:${windowId}`;
  try {
    if (kv) {
      const n = await kv.incr(key);
      if (n === 1) await kv.expire(key, windowSeconds + 5);
      return n <= limit;
    }
  } catch {
    return true; // fail open: a Redis hiccup shouldn't take the feature down (the GitHub budget still bounds it)
  }
  const now = Date.now();
  const entry = mem.counters.get(key);
  if (!entry || entry.expires < now) {
    mem.counters.set(key, { n: 1, expires: now + windowSeconds * 1000 });
    trimMem();
    return true;
  }
  entry.n += 1;
  return entry.n <= limit;
}
