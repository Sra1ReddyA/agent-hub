import { Redis } from "@upstash/redis";
import { DEFAULT_PLAN, type Plan } from "./plan";

/**
 * One record per GitHub App installation — the tenant itself, separate from the per-repo `RepoConfig`s it
 * owns (`repoConfigStore.ts`). This is what makes the "one hosted instance, many customers" story real:
 * before this existed, an installation was only implicit in the repo configs it happened to own, there was
 * no plan/limit to enforce, and nothing let `/dashboard` answer "which account is this, and what have they
 * got installed" without scanning every repo config in Redis. Uses the same client instance repoConfigStore
 * does (both require Redis; there's no separate configuration story for this one).
 */

const KV_CONFIGURED = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const kv = KV_CONFIGURED ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }) : null;

export type Installation = {
  installationId: number;
  accountLogin: string; // the GitHub user or org the App is installed on
  accountType: "User" | "Organization";
  accountId: number; // GitHub's numeric id for that account — what OAuth login matches against, not the login string (which can change)
  plan: Plan;
  repoCount: number; // total repos this installation currently grants access to
  trackedRepoCount: number; // how many of those actually have a RepoConfig (capped by the plan's limit)
  createdAt: number;
  updatedAt: number;
};

const INSTALL_KEY = (installationId: number) => `ah:gh:install:${installationId}`;
const INSTALL_SET_KEY = "ah:gh:installs";
// Reverse index: GitHub account id -> installation ids they own, so OAuth login (which only knows the
// signed-in user's account id) can find "which installations does this person administer" without a scan.
const ACCOUNT_INSTALLS_KEY = (accountId: number) => `ah:gh:account-installs:${accountId}`;

function assertKv(): Redis {
  if (!kv) throw new Error("Agent Hub Sync needs Redis configured — see repoConfigStore.ts's REDIS_REQUIRED_MESSAGE.");
  return kv;
}

export function isInstallationStoreConfigured(): boolean {
  return kv !== null;
}

export async function getInstallation(installationId: number): Promise<Installation | null> {
  const client = assertKv();
  return (await client.get<Installation>(INSTALL_KEY(installationId))) ?? null;
}

/** Creates or updates an installation record. Pass the fields that changed; existing ones (notably `plan`,
 * which nothing here ever sets except the initial default) are preserved via the caller passing the full
 * merged object — see `upsertInstallation` for the common "just touched repo counts" case. */
export async function saveInstallation(installation: Installation): Promise<void> {
  const client = assertKv();
  await Promise.all([
    client.set(INSTALL_KEY(installation.installationId), installation),
    client.sadd(INSTALL_SET_KEY, installation.installationId),
    client.sadd(ACCOUNT_INSTALLS_KEY(installation.accountId), installation.installationId),
  ]);
}

/** Creates the record on first sight of an installation, or merges in fresh account/repo-count info on an
 * update — never resets `plan` (set once, changed only by whoever runs the deployment) or `createdAt`. */
export async function upsertInstallation(
  installationId: number,
  fields: { accountLogin: string; accountType: "User" | "Organization"; accountId: number; repoCount: number; trackedRepoCount: number },
): Promise<Installation> {
  const existing = await getInstallation(installationId);
  const now = Date.now();
  const next: Installation = {
    installationId,
    accountLogin: fields.accountLogin,
    accountType: fields.accountType,
    accountId: fields.accountId,
    plan: existing?.plan ?? DEFAULT_PLAN,
    repoCount: fields.repoCount,
    trackedRepoCount: fields.trackedRepoCount,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await saveInstallation(next);
  return next;
}

export async function removeInstallationRecord(installationId: number): Promise<void> {
  const client = assertKv();
  const existing = await getInstallation(installationId);
  const ops: Promise<unknown>[] = [client.del(INSTALL_KEY(installationId)), client.srem(INSTALL_SET_KEY, installationId)];
  if (existing) ops.push(client.srem(ACCOUNT_INSTALLS_KEY(existing.accountId), installationId));
  await Promise.all(ops);
}

/** Every installation id a GitHub account (by numeric id, from an OAuth-authenticated `GET /user`) owns or
 * administers — this is the whole authorization boundary for `/dashboard`: an installation id NOT in this
 * list for the signed-in user is never shown or mutable, no matter what a form posts. */
export async function installationIdsForAccount(accountId: number): Promise<number[]> {
  const client = assertKv();
  const ids = await client.smembers<string[]>(ACCOUNT_INSTALLS_KEY(accountId));
  return ids.map(Number).filter((n) => Number.isFinite(n));
}

export async function listAllInstallations(): Promise<Installation[]> {
  const client = assertKv();
  const ids = await client.smembers<string[]>(INSTALL_SET_KEY);
  if (ids.length === 0) return [];
  const records = await Promise.all(ids.map((id) => client.get<Installation>(INSTALL_KEY(Number(id)))));
  return records.filter((r): r is Installation => r !== null);
}
