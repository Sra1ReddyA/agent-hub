import { NextRequest } from "next/server";
import { parseRepoRef, ScanError } from "@/lib/agent-hub/scan/github";
import { badgeSvg, colorForScore } from "@/lib/score/badge";
import { scoreRepo } from "@/lib/score/service";

export const runtime = "nodejs";

const SVG_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  // An SVG served directly is a document: lock it down so it can never run script even if it were tampered with.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
};

function svg(body: string, cache: string) {
  return new Response(body, { status: 200, headers: { ...SVG_HEADERS, "Cache-Control": cache } });
}

/** `GET /api/score/badge?repo=owner/name` — the README badge. Always answers 200 with an image (a broken image
 * in someone's README is worse than a grey "n/a"), cached hard at the CDN so views don't become scans. */
export async function GET(req: NextRequest) {
  const ref = parseRepoRef(req.nextUrl.searchParams.get("repo") ?? "");
  if (!ref) return svg(badgeSvg("agent-ready", "invalid repo", colorForScore(null)), "public, max-age=300, s-maxage=300");

  try {
    // No per-IP limit here on purpose: GitHub's image proxy fetches READMEs' badges from a few shared IPs. The
    // result cache plus the global scan budget in scoreRepo() are what protect the GitHub quota instead.
    const { report } = await scoreRepo(ref.owner, ref.repo);
    return svg(badgeSvg("agent-ready", `${report.total}/100`, colorForScore(report.total)), "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  } catch (err) {
    const busy = err instanceof ScanError && err.code === "rate-limited";
    const label = err instanceof ScanError && err.code === "not-found" ? "not found" : busy ? "busy" : "unavailable";
    return svg(badgeSvg("agent-ready", label, colorForScore(null)), busy ? "public, max-age=30, s-maxage=60" : "public, max-age=120, s-maxage=300");
  }
}
