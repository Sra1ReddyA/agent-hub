"use server";

import { revalidatePath } from "next/cache";
import type { GenerationMode } from "@/lib/agent-hub/generator";
import type { StackId } from "@/lib/agent-hub/stacks";
import type { TargetId } from "@/lib/agent-hub/targets";
import { getRepoConfig, saveRepoConfig } from "@/lib/github-app/repoConfigStore";
import { syncRepo } from "@/lib/github-app/sync";

/**
 * Server Actions backing `/admin/sync`. These run as POSTs to that same page's own route, so they're
 * covered by `src/proxy.ts`'s existing `/admin/:path*` Basic Auth matcher without needing a separate
 * `/api/admin/*` surface to remember to protect — there's exactly one operator, and this page is already
 * behind their login.
 */

function parseKey(key: string): { installationId: number; repoFullName: string } {
  // `key` is `${installationId}::${owner}/${repo}` — see the hidden form field in page.tsx.
  const [idStr, repoFullName] = key.split("::");
  return { installationId: Number(idStr), repoFullName };
}

export async function updateRepoConfig(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const { installationId, repoFullName } = parseKey(key);
  const existing = await getRepoConfig(installationId, repoFullName);
  if (!existing) return;

  const stackIds = formData.getAll("stackIds") as StackId[];
  const targetIds = formData.getAll("targetIds") as TargetId[];
  const mode = (formData.get("mode") as GenerationMode) || existing.mode;
  const includeCiCheck = formData.get("includeCiCheck") === "on";
  const customRules = String(formData.get("customRules") ?? "").trim();

  await saveRepoConfig({
    ...existing,
    stackIds,
    targetIds,
    mode,
    includeCiCheck,
    customRules: customRules.length > 0 ? customRules : undefined,
  });

  revalidatePath("/admin/sync");
}

export async function triggerSyncNow(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const { installationId, repoFullName } = parseKey(key);
  const config = await getRepoConfig(installationId, repoFullName);
  if (!config) return;

  await syncRepo(config); // result is persisted onto the config itself (lastSyncedAt/lastPrUrl/etc) by syncRepo
  revalidatePath("/admin/sync");
}
