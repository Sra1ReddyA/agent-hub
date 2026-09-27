import { Redis } from "@upstash/redis";

/**
 * The one piece of server-side state in an otherwise fully client-side app. Everything else in Agent Hub
 * (stack selection, bundle generation, the zip file) still runs entirely in the visitor's browser — this
 * module exists solely so the site owner can see how many people visit and what they generate, behind the
 * password-protected `/admin` page (see `src/proxy.ts`).
 *
 * Backed by Upstash Redis when it's configured (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — set
 * automatically once you add a Redis storage integration to this Vercel project from the Marketplace, or
 * paste them in yourself from a free upstash.com database), which is durable across deployments and
 * serverless cold starts. Falls back to an in-process, in-memory store when it isn't configured, so
 * `npm run dev` and a fresh clone work immediately with zero setup — that fallback resets on every restart
 * and isn't shared across serverless instances, so treat it as a local-dev convenience only, never as
 * production analytics.
 */

const KV_CONFIGURED = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Constructed lazily and only when configured — Redis.fromEnv()/the constructor throws immediately if the
// required env vars are missing, so this must never run in the unconfigured (local-dev fallback) path.
const kv = KV_CONFIGURED ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }) : null;

type VisitEvent = { ts: number; path: string; ref: string };
type BundleEvent = { ts: number; stacks: string[]; mode: string; targets: string[]; ci: boolean };

const RECENT_VISITS_CAP = 200;
const RECENT_BUNDLES_CAP = 100;
const DAILY_DAYS_KEPT = 60;

// --- In-memory fallback (used only when Upstash Redis isn't configured) ----------------------------
//
// Next.js compiles route handlers, Server Components and middleware/proxy into separate module
// "layers" — even in a single dev process, `import "./store"` from an API route and from a page
// resolves to two different module instances, each with its own copy of any module-level `const`.
// A singleton stashed there would silently look empty half the time (visits recorded by the API
// route would never show up when the admin page reads `mem`). Anchoring the object on `globalThis`
// instead makes every layer share the same object, since `globalThis` is one per process regardless
// of how many times the module graph re-evaluates this file. This still resets on a serverless cold
// start / redeploy in production (each isolate has its own `globalThis`) — that limitation is real
// and is exactly why Upstash Redis is recommended for production; this fix only guarantees the
// fallback behaves correctly and consistently within a single running process (`npm run dev`, or a
// warm serverless instance serving several requests).
type MemStore = {
  totalVisits: number;
  totalBundles: number;
  dailyVisits: Map<string, number>;
  recentVisits: VisitEvent[];
  recentBundles: BundleEvent[];
  stackCounts: Map<string, number>;
  modeCounts: Map<string, number>;
  targetCounts: Map<string, number>;
  ciChecked: number;
};
const MEM_KEY = Symbol.for("agent-hub.analytics.mem");
type GlobalWithMem = typeof globalThis & { [MEM_KEY]?: MemStore };
const globalWithMem = globalThis as GlobalWithMem;
const mem: MemStore =
  globalWithMem[MEM_KEY] ??
  (globalWithMem[MEM_KEY] = {
    totalVisits: 0,
    totalBundles: 0,
    dailyVisits: new Map<string, number>(),
    recentVisits: [] as VisitEvent[],
    recentBundles: [] as BundleEvent[],
    stackCounts: new Map<string, number>(),
    modeCounts: new Map<string, number>(),
    targetCounts: new Map<string, number>(),
    ciChecked: 0,
  });

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
}

function pushCapped<T>(arr: T[], item: T, cap: number) {
  arr.unshift(item);
  if (arr.length > cap) arr.length = cap;
}

/** Records one page view. Best-effort and fire-and-forget from the caller's side — a failure here never
 * blocks or breaks anything a visitor is doing, since it's purely for the site owner's own visibility. */
export async function recordVisit(path: string, ref: string): Promise<void> {
  const ts = Date.now();
  const day = dayKey(ts);
  try {
    if (kv) {
      await Promise.all([
        kv.incr("ah:visits:total"),
        kv.hincrby("ah:visits:daily", day, 1),
        kv.lpush("ah:visits:recent", JSON.stringify({ ts, path, ref })),
        kv.ltrim("ah:visits:recent", 0, RECENT_VISITS_CAP - 1),
      ]);
    } else {
      mem.totalVisits += 1;
      mem.dailyVisits.set(day, (mem.dailyVisits.get(day) ?? 0) + 1);
      pushCapped(mem.recentVisits, { ts, path, ref }, RECENT_VISITS_CAP);
    }
  } catch {
    // Analytics must never take the site down — swallow and move on.
  }
}

/** Records one "bundle generated" event — which stacks, mode, tools and CI toggle a visitor actually
 * picked. This is the real usage signal (what people build with it), distinct from a raw page view. */
export async function recordBundleEvent(event: { stacks: string[]; mode: string; targets: string[]; ci: boolean }): Promise<void> {
  const ts = Date.now();
  try {
    if (kv) {
      const ops: Promise<unknown>[] = [
        kv.incr("ah:bundles:total"),
        kv.lpush("ah:bundles:recent", JSON.stringify({ ts, ...event })),
        kv.ltrim("ah:bundles:recent", 0, RECENT_BUNDLES_CAP - 1),
        kv.hincrby("ah:bundles:mode", event.mode, 1),
      ];
      for (const s of event.stacks) ops.push(kv.hincrby("ah:bundles:stack", s, 1));
      for (const t of event.targets) ops.push(kv.hincrby("ah:bundles:target", t, 1));
      if (event.ci) ops.push(kv.incr("ah:bundles:ci"));
      await Promise.all(ops);
    } else {
      mem.totalBundles += 1;
      pushCapped(mem.recentBundles, { ts, ...event }, RECENT_BUNDLES_CAP);
      mem.modeCounts.set(event.mode, (mem.modeCounts.get(event.mode) ?? 0) + 1);
      for (const s of event.stacks) mem.stackCounts.set(s, (mem.stackCounts.get(s) ?? 0) + 1);
      for (const t of event.targets) mem.targetCounts.set(t, (mem.targetCounts.get(t) ?? 0) + 1);
      if (event.ci) mem.ciChecked += 1;
    }
  } catch {
    // Same as above — never let a tracking failure affect the visitor's download.
  }
}

export type AnalyticsSummary = {
  usingKv: boolean;
  totalVisits: number;
  totalBundles: number;
  dailyVisits: { day: string; count: number }[]; // most recent first, capped
  recentVisits: VisitEvent[];
  recentBundles: BundleEvent[];
  topStacks: { id: string; count: number }[];
  modeCounts: { mode: string; count: number }[];
  topTargets: { id: string; count: number }[];
  ciCheckedCount: number;
};

function sortedEntries(map: Record<string, number> | Map<string, number>): { id: string; count: number }[] {
  const entries = map instanceof Map ? Array.from(map.entries()) : Object.entries(map);
  return entries.map(([id, count]) => ({ id, count: Number(count) })).sort((a, b) => b.count - a.count);
}

/** Reads everything the `/admin` page displays, in one call. Server-only — never imported by client code. */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  if (!kv) {
    const days = Array.from(mem.dailyVisits.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .slice(0, DAILY_DAYS_KEPT);
    return {
      usingKv: false,
      totalVisits: mem.totalVisits,
      totalBundles: mem.totalBundles,
      dailyVisits: days,
      recentVisits: mem.recentVisits,
      recentBundles: mem.recentBundles,
      topStacks: sortedEntries(mem.stackCounts),
      modeCounts: sortedEntries(mem.modeCounts).map((e) => ({ mode: e.id, count: e.count })),
      topTargets: sortedEntries(mem.targetCounts),
      ciCheckedCount: mem.ciChecked,
    };
  }

  const [totalVisits, totalBundles, dailyRaw, recentVisitsRaw, recentBundlesRaw, stackRaw, modeRaw, targetRaw, ciChecked] = await Promise.all([
    kv.get<number>("ah:visits:total"),
    kv.get<number>("ah:bundles:total"),
    kv.hgetall<Record<string, number>>("ah:visits:daily"),
    kv.lrange<string>("ah:visits:recent", 0, RECENT_VISITS_CAP - 1),
    kv.lrange<string>("ah:bundles:recent", 0, RECENT_BUNDLES_CAP - 1),
    kv.hgetall<Record<string, number>>("ah:bundles:stack"),
    kv.hgetall<Record<string, number>>("ah:bundles:mode"),
    kv.hgetall<Record<string, number>>("ah:bundles:target"),
    kv.get<number>("ah:bundles:ci"),
  ]);

  const dailyVisits = Object.entries(dailyRaw ?? {})
    .map(([day, count]) => ({ day, count: Number(count) }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, DAILY_DAYS_KEPT);

  const parseEvents = <T,>(raw: string[] | null): T[] =>
    (raw ?? []).flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });

  return {
    usingKv: true,
    totalVisits: totalVisits ?? 0,
    totalBundles: totalBundles ?? 0,
    dailyVisits,
    recentVisits: parseEvents<VisitEvent>(recentVisitsRaw),
    recentBundles: parseEvents<BundleEvent>(recentBundlesRaw),
    topStacks: sortedEntries(stackRaw ?? {}),
    modeCounts: sortedEntries(modeRaw ?? {}).map((e) => ({ mode: e.id, count: e.count })),
    topTargets: sortedEntries(targetRaw ?? {}),
    ciCheckedCount: ciChecked ?? 0,
  };
}
