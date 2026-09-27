import { Redis } from "@upstash/redis";
import type { GenerationMode } from "../agent-hub/generator";
import type { StackId } from "../agent-hub/stacks";
import type { TargetId } from "../agent-hub/targets";

/**
 * Durable, per-repo state for Agent Hub Sync — which repos are tracked, what they're configured to
 * generate, and what was last synced (so a re-run only opens a PR when something has actually changed).
 * This is real state a webhook or cron run depends on across invocations, unlike `analytics/store.ts`'s
 * in-memory fallback, so this module requires Upstash Redis — there's no in-memory fallback here, because
 * a sync feature that silently forgets which repos it's watching on every cold start isn't a sync feature.
 */

const KV_CONFIGURED = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const kv = KV_CONFIGURED ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }) : null;

export const REDIS_REQUIRED_MESSAGE =
  "Agent Hub Sync needs UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN set — it has to remember which repos it's watching between runs, so unlike /admin's analytics there's no in-memory fallback for this one.";

export type RepoConfig = {
  installationId: number;
  repoFullName: string; // "owner/repo"
  defaultBranch: string;
  stackIds: StackId[]; // last-known stack combination (auto-detected, merged additively over time)
  mode: GenerationMode;
  targetIds: TargetId[];
  customRules?: string;
  includeCiCheck: boolean;
  lastSyncedContentVersion: string | null; // Agent Hub TEMPLATE_CONTENT_VERSION at last successful sync
  lastSyncedAt: number | null;
  lastPrUrl: string | null;
};

const REPO_KEY = (installationId: number, repoFullName: string) => `ah:gh:repo:${installationId}:${repoFullName}`;
const REPO_SET_KEY = "ah:gh:repos"; // a Redis Set of every tracked repo's REPO_KEY, for the cron sweep

function assertKv(): Redis {
  if (!kv) throw new Error(REDIS_REQUIRED_MESSAGE);
  return kv;
}

export function isRedisConfigured(): boolean {
  return kv !== null;
}

export async function getRepoConfig(installationId: number, repoFullName: string): Promise<RepoConfig | null> {
  const client = assertKv();
  return (await client.get<RepoConfig>(REPO_KEY(installationId, repoFullName))) ?? null;
}

export async function saveRepoConfig(config: RepoConfig): Promise<void> {
  const client = assertKv();
  const key = REPO_KEY(config.installationId, config.repoFullName);
  await Promise.all([client.set(key, config), client.sadd(REPO_SET_KEY, key)]);
}

export async function removeRepoConfig(installationId: number, repoFullName: string): Promise<void> {
  const client = assertKv();
  const key = REPO_KEY(installationId, repoFullName);
  await Promise.all([client.del(key), client.srem(REPO_SET_KEY, key)]);
}

/** Every tracked repo, for the cron sweep (`/api/cron/resync`) — repos not touched by any push since
 * install still need to pick up a bump in Agent Hub's own `TEMPLATE_CONTENT_VERSION`. */
export async function listAllRepoConfigs(): Promise<RepoConfig[]> {
  const client = assertKv();
  const keys = await client.smembers<string[]>(REPO_SET_KEY);
  if (keys.length === 0) return [];
  const configs = await Promise.all(keys.map((k) => client.get<RepoConfig>(k)));
  return configs.filter((c): c is RepoConfig => c !== null);
}

/** Removes every repo config for an installation — called when the App is uninstalled. */
export async function removeInstallation(installationId: number): Promise<void> {
  const client = assertKv();
  const keys = await client.smembers<string[]>(REPO_SET_KEY);
  const mine = keys.filter((k) => k.startsWith(`ah:gh:repo:${installationId}:`));
  if (mine.length === 0) return;
  await Promise.all([...mine.map((k) => client.del(k)), client.srem(REPO_SET_KEY, ...mine)]);
}
