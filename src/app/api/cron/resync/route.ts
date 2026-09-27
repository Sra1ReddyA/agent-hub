import { NextRequest, NextResponse } from "next/server";
import { TEMPLATE_CONTENT_VERSION } from "@/lib/agent-hub/version";
import { CRON_SECRET, GITHUB_APP_CONFIGURED } from "@/lib/github-app/env";
import { isRedisConfigured, listAllRepoConfigs } from "@/lib/github-app/repoConfigStore";
import { syncRepo } from "@/lib/github-app/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The other half of Agent Hub Sync's "stays current without anyone remembering to come back": a push
 * webhook catches a repo's *dependencies* changing, but it does nothing for a repo that's gone quiet while
 * Agent Hub's own guardrail content moves on. Vercel Cron (see `vercel.json`) hits this daily; it sweeps
 * every tracked repo and only actually does anything for the ones whose `lastSyncedContentVersion` is
 * behind `TEMPLATE_CONTENT_VERSION` — `syncRepo` itself is the thing that's a no-op otherwise, so this
 * route is intentionally "call it on everything, let it sort out what's stale."
 */
export async function GET(req: NextRequest) {
  if (!GITHUB_APP_CONFIGURED || !isRedisConfigured()) {
    return new NextResponse("Agent Hub Sync isn't configured on this deployment.", { status: 503 });
  }

  // Vercel signs its own cron invocations with this header automatically; a manual curl needs to know
  // CRON_SECRET. Without CRON_SECRET set at all, refuse rather than silently running unauthenticated.
  if (!CRON_SECRET) {
    return new NextResponse("CRON_SECRET is not set — refusing to run an unauthenticated resync.", { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const configs = await listAllRepoConfigs();
  const results = await Promise.all(
    configs.map(async (config) => ({
      repo: config.repoFullName,
      ...(await syncRepo(config)),
    })),
  );

  return NextResponse.json({
    templateVersion: TEMPLATE_CONTENT_VERSION,
    reposChecked: results.length,
    results,
  });
}
