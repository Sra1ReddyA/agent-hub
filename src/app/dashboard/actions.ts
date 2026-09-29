"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { GenerationMode } from "@/lib/agent-hub/generator";
import type { StackId } from "@/lib/agent-hub/stacks";
import type { TargetId } from "@/lib/agent-hub/targets";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { getRepoConfig, saveRepoConfig } from "@/lib/github-app/repoConfigStore";
import { syncRepo, type SyncResult } from "@/lib/github-app/sync";

/**
 * Server Actions backing `/dashboard` — the tenant-scoped twin of `src/app/admin/sync/actions.ts`, with one
 * difference that actually matters: `/admin/sync`'s actions trust whatever `key` a posted form carries,
 * which is fine there because that whole surface sits behind one operator's Basic Auth and shows every
 * installation on purpose. `/dashboard` is reachable by anyone who can sign in with ANY GitHub account, so
 * trusting a posted `installationId` the same way would let one customer edit another customer's repo just
 * by editing the hidden form field in devtools. Every action here re-derives the caller's own installation
 * ids from their signed session cookie — never from anything the client submitted — and refuses to touch a
 * config whose `installationId` isn't in that list.
 */

export type ActionState = { kind: "idle" } | { kind: "saved" } | { kind: "synced"; result: SyncResult } | { kind: "error"; message: string };

function parseKey(key: string): { installationId: number; repoFullName: string } {
  const [idStr, repoFullName] = key.split("::");
  return { installationId: Number(idStr), repoFullName };
}

/** The one authorization check every action below goes through: is this signed-in person allowed to touch
 * this installation at all? Returns their installation ids on success, or null if there's no valid session
 * — callers turn a null into the same "not found" message a missing repo would get, so a stranger probing
 * for other tenants' repo keys learns nothing about whether the key exists. */
async function authorizedInstallationIds(): Promise<number[] | null> {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return session ? session.installationIds : null;
}

const NOT_FOUND: ActionState = { kind: "error", message: "This repo wasn't found on your account — it may have just been uninstalled, or you may not have access to it." };

export async function updateRepoConfig(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ids = await authorizedInstallationIds();
  if (!ids) return NOT_FOUND;

  const key = String(formData.get("key") ?? "");
  const { installationId, repoFullName } = parseKey(key);
  if (!ids.includes(installationId)) return NOT_FOUND;

  const existing = await getRepoConfig(installationId, repoFullName);
  if (!existing) return NOT_FOUND;

  const stackIds = formData.getAll("stackIds") as StackId[];
  const targetIds = formData.getAll("targetIds") as TargetId[];
  const mode = (formData.get("mode") as GenerationMode) || existing.mode;
  const includeCiCheck = formData.get("includeCiCheck") === "on";
  const customRules = String(formData.get("customRules") ?? "").trim();

  try {
    await saveRepoConfig({
      ...existing,
      stackIds,
      targetIds,
      mode,
      includeCiCheck,
      customRules: customRules.length > 0 ? customRules : undefined,
    });
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }

  revalidatePath("/dashboard");
  return { kind: "saved" };
}

export async function triggerSyncNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ids = await authorizedInstallationIds();
  if (!ids) return NOT_FOUND;

  const key = String(formData.get("key") ?? "");
  const { installationId, repoFullName } = parseKey(key);
  if (!ids.includes(installationId)) return NOT_FOUND;

  const config = await getRepoConfig(installationId, repoFullName);
  if (!config) return NOT_FOUND;

  const result = await syncRepo(config);
  revalidatePath("/dashboard");

  if (result.status === "error") return { kind: "error", message: result.message };
  return { kind: "synced", result };
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
}
