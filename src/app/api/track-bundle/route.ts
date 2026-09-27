import { NextRequest, NextResponse } from "next/server";
import { recordBundleEvent } from "@/lib/analytics/store";

export const runtime = "nodejs";

const MAX_ITEMS = 30; // guards against a malformed/hostile payload turning this into an unbounded write

/** Records one "bundle generated" event — called from `OutputPreview.tsx` right after a successful
 * download, best-effort. This is the actual usage signal the `/admin` page is for: not just "someone
 * visited," but "someone picked Python + FastAPI + MongoDB, Combined mode, with the CI check on." Only
 * ids (stack/target/mode strings and a boolean) are sent — never the generated file content, never the
 * team-specific custom rules text, since that could contain something specific to the visitor's own repo. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { stacks?: unknown; mode?: unknown; targets?: unknown; ci?: unknown };
    const stacks = Array.isArray(body.stacks) ? body.stacks.filter((s): s is string => typeof s === "string").slice(0, MAX_ITEMS) : [];
    const targets = Array.isArray(body.targets) ? body.targets.filter((t): t is string => typeof t === "string").slice(0, MAX_ITEMS) : [];
    const mode = body.mode === "modular" ? "modular" : "combined";
    const ci = body.ci === true;
    if (stacks.length > 0) await recordBundleEvent({ stacks, mode, targets, ci });
  } catch {
    // Never surface a tracking failure to the visitor.
  }
  return new NextResponse(null, { status: 204 });
}
