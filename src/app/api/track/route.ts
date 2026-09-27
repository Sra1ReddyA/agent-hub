import { NextRequest, NextResponse } from "next/server";
import { recordVisit } from "@/lib/analytics/store";

export const runtime = "nodejs";

/** Records one page view for the `/admin` dashboard. Called by `components/Analytics.tsx` on every route
 * change via `navigator.sendBeacon`, which is fire-and-forget by design — nothing here ever blocks or
 * fails a visitor's actual use of the generator. Deliberately collects almost nothing: a path and a bare
 * referrer hostname, no IP address, no cookies, no fingerprinting — enough to answer "is anyone using
 * this," nothing that needs a cookie/privacy banner. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { path?: string; ref?: string };
    const path = typeof body.path === "string" ? body.path.slice(0, 200) : "/";
    let ref = "";
    if (typeof body.ref === "string" && body.ref) {
      try {
        ref = new URL(body.ref).hostname.slice(0, 100);
      } catch {
        ref = "";
      }
    }
    await recordVisit(path, ref);
  } catch {
    // Never surface a tracking failure to the visitor.
  }
  return new NextResponse(null, { status: 204 });
}
