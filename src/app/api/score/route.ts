import { NextRequest, NextResponse } from "next/server";
import { parseRepoRef, ScanError } from "@/lib/agent-hub/scan/github";
import { clientIp } from "@/lib/score/request";
import { scoreRepo } from "@/lib/score/service";

export const runtime = "nodejs";

const STATUS: Record<string, number> = { invalid: 400, "not-found": 404, "rate-limited": 429, upstream: 502 };

/** `GET /api/score?repo=owner/name[&rules=1]` — the Agent-Readiness Score as JSON, for CI, dashboards and other
 * tools. Public data about public repos, so it's CORS-open for GET. */
export async function GET(req: NextRequest) {
  const ref = parseRepoRef(req.nextUrl.searchParams.get("repo") ?? "");
  if (!ref) return NextResponse.json({ error: "Pass ?repo=owner/name (a public GitHub repository)." }, { status: 400 });

  try {
    const r = await scoreRepo(ref.owner, ref.repo, { ip: clientIp(req.headers), withRules: req.nextUrl.searchParams.get("rules") === "1" });
    const { facts, ...report } = r.report;
    return NextResponse.json(
      {
        repo: r.meta.fullName,
        score: report.total,
        label: report.label,
        rubric: report.rubric,
        categories: report.categories,
        checks: report.checks,
        nextSteps: report.nextSteps,
        facts: { stacks: facts.stacks, commands: facts.commands, testFileCount: facts.testFileCount, agentFiles: facts.agent.files, agentTools: facts.agent.tools, instructionTokens: facts.agent.maxTokens, truncated: facts.truncated },
        learnedRules: r.rules,
        history: r.history,
        scannedAt: r.scannedAt,
        cached: r.cached,
      },
      { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60, s-maxage=300" } },
    );
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message, code: err.code }, { status: STATUS[err.code] ?? 500, headers: { "Access-Control-Allow-Origin": "*" } });
    return NextResponse.json({ error: "Unexpected error while scanning." }, { status: 500 });
  }
}
