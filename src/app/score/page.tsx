import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { CopyButton } from "@/components/CopyButton";
import { parseRepoRef, ScanError } from "@/lib/agent-hub/scan/github";
import type { CategoryId, Check } from "@/lib/agent-hub/scan/score";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { colorForScore } from "@/lib/score/badge";
import { clientIp } from "@/lib/score/request";
import { scoreRepo, type ScoreResult } from "@/lib/score/service";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const repo = typeof sp.repo === "string" ? parseRepoRef(sp.repo) : null;
  const base = pageMetadata({
    title: "Agent-Readiness Score — How ready is your repo for AI coding agents?",
    description: "Paste any public GitHub repo and get a 0–100 score for how safely and cheaply AI coding agents (Claude Code, Cursor, Copilot) can work in it — with the exact fixes, a README badge, and rules mined from your code reviews.",
    path: "/score",
    keywords: ["ai agent readiness score", "is my repo ready for ai coding agents", "agents.md checker", "cursorrules checker", "claude.md audit"],
  });
  return repo ? { ...base, title: `${repo.owner}/${repo.repo} — Agent-Readiness Score`, robots: { index: false, follow: true } } : base;
}

const CATEGORY_ORDER: CategoryId[] = ["instructions", "feedback", "security", "hygiene", "efficiency"];

function Ring({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = colorForScore(value);
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0" role="img" aria-label={`Score ${value} out of 100`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-border)" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
      <text x="60" y="58" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--color-ink)">
        {value}
      </text>
      <text x="60" y="76" textAnchor="middle" fontSize="11" fill="var(--color-muted)">
        out of 100
      </text>
    </svg>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 160;
  const h = 36;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / 100) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-40" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
    </svg>
  );
}

function CheckRow({ c }: { c: Check }) {
  return (
    <li className="flex gap-3 py-2 text-sm">
      <span aria-hidden="true" className={`mt-0.5 font-mono ${c.ok ? "text-[var(--color-success)]" : c.points > 0 ? "text-amber-500" : "text-[var(--color-danger)]"}`}>
        {c.ok ? "✓" : c.points > 0 ? "◐" : "✗"}
      </span>
      <div className="min-w-0">
        <p className="text-[var(--color-ink)]">
          {c.label} <span className="font-mono text-xs text-[var(--color-muted)]">{c.points}/{c.max}</span>
        </p>
        {c.detail && <p className="mt-0.5 break-words text-xs text-[var(--color-muted)]">{c.detail}</p>}
        {!c.ok && c.fix && <p className="mt-0.5 text-xs text-[var(--color-muted)]">→ {c.fix}</p>}
      </div>
    </li>
  );
}

function Result({ r }: { r: ScoreResult }) {
  const { report, meta } = r;
  const repoParam = meta.fullName;
  const badgeMd = `[![Agent-Readiness](${SITE_URL}/api/score/badge?repo=${repoParam})](${SITE_URL}/score?repo=${repoParam})`;
  const hist = r.history;
  const first = hist[0];
  const delta = first && hist.length > 1 && first.rubric === report.rubric ? report.total - first.total : null;
  const f = report.facts;

  return (
    <div className="mt-8 space-y-6">
      <section className="flex flex-col items-center gap-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:flex-row">
        <Ring value={report.total} />
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-sm text-[var(--color-muted)]">{meta.fullName}{meta.stars > 0 ? ` · ★ ${meta.stars.toLocaleString("en-US")}` : ""}</p>
          <h2 className="mt-1 text-2xl font-bold text-[var(--color-ink)]" style={{ color: colorForScore(report.total) }}>
            {report.label}
          </h2>
          {meta.description && <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">{meta.description}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--color-muted)] sm:justify-start">
            {f.stacks.length > 0 && <span className="pill">{f.stacks.slice(0, 6).join(" · ")}</span>}
            {f.agent.tools.length > 0 && <span className="pill">Agent files: {f.agent.tools.join(", ")}</span>}
            {f.agent.maxTokens > 0 && <span className="pill">≈ {f.agent.maxTokens.toLocaleString("en-US")} tokens per request</span>}
            {delta !== null && <span className="pill">{delta >= 0 ? "+" : ""}{delta} since first scan</span>}
            {f.truncated && <span className="pill">large repo — partial scan</span>}
          </div>
          {hist.length > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2 sm:justify-start">
              <Sparkline points={hist.map((h) => h.total)} />
              <span className="text-xs text-[var(--color-muted)]">{hist.length} scans</span>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {report.categories.map((c) => (
          <div key={c.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <p className="text-xs text-[var(--color-muted)]">{c.label}</p>
            <p className="mt-1 font-mono text-lg text-[var(--color-ink)]">
              {c.points}
              <span className="text-xs text-[var(--color-muted)]">/{c.max}</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div className="h-full rounded-full" style={{ width: `${(c.points / c.max) * 100}%`, background: colorForScore((c.points / c.max) * 100) }} />
            </div>
          </div>
        ))}
      </section>

      {report.nextSteps.length > 0 && (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-5">
          <h3 className="font-semibold text-[var(--color-ink)]">Fix these first</h3>
          <ol className="mt-3 space-y-2 text-sm text-[var(--color-ink)]">
            {report.nextSteps.map((s) => (
              <li key={s.id}>
                <span className="font-medium">{s.label}</span> <span className="font-mono text-xs text-[var(--color-muted)]">+{s.max - s.points} pts</span>
                <br />
                <span className="text-[var(--color-muted)]">{s.fix}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" className="btn-primary">Generate the agent files →</Link>
            <Link href="/sync" className="btn-ghost">Keep them current with Sync</Link>
          </div>
        </section>
      )}

      {r.rulesChecked && (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h3 className="font-semibold text-[var(--color-ink)]">Rules your reviewers keep repeating</h3>
          {r.rules.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              {r.ruleStats && r.ruleStats.comments > 0
                ? `Read the ${r.ruleStats.comments} most recent review comments (${r.ruleStats.fromMaintainers} from maintainers): none made the same general point on two different pull requests, so there's nothing to learn yet.`
                : "No review comments were available to read for this repository."}
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Mined from recent comments by maintainers on at least two different PRs. Agents that were given these wouldn&apos;t need the same review comment again. Review before adopting.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-[var(--color-ink)]">
                {r.rules.map((rule) => (
                  <li key={rule.text} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>
                      {rule.text} <span className="text-xs text-[var(--color-muted)]">seen in {rule.prs} PRs{rule.scope ? ` · ${rule.scope}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <CopyButton text={r.rules.map((x) => `- ${x.text}`).join("\n")} label="Copy as rules" />
              </div>
            </>
          )}
        </section>
      )}

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="font-semibold text-[var(--color-ink)]">All checks</h3>
        <div className="mt-3 space-y-4">
          {CATEGORY_ORDER.map((id) => {
            const cat = report.categories.find((c) => c.id === id)!;
            return (
              <details key={id} open={id === "instructions" || id === "security"}>
                <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink)]">
                  {cat.label} <span className="font-mono text-xs text-[var(--color-muted)]">{cat.points}/{cat.max}</span>
                </summary>
                <ul className="mt-1 divide-y divide-[var(--color-border)]">
                  {report.checks.filter((c) => c.category === id).map((c) => (
                    <CheckRow key={c.id} c={c} />
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Security checks are heuristics over the repo&apos;s file tree and a sample of up to 16 source files — a quick signal, not an audit. Scored {new Date(r.scannedAt).toISOString().slice(0, 16).replace("T", " ")} UTC{r.cached ? " (cached)" : ""}.
        </p>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="font-semibold text-[var(--color-ink)]">Show it off</h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">Paste this at the top of your README. It updates itself.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/score/badge?repo=${repoParam}`} alt="Agent-Readiness badge" className="mt-3 h-5" />
        <pre className="mt-3 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-bg)] p-3 font-mono text-xs text-[var(--color-ink)]">{badgeMd}</pre>
        <div className="mt-2">
          <CopyButton text={badgeMd} label="Copy badge markdown" />
        </div>
      </section>
    </div>
  );
}

export default async function ScorePage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = typeof sp.repo === "string" ? sp.repo : "";
  const ref = raw ? parseRepoRef(raw) : null;

  let result: ScoreResult | null = null;
  let error: string | null = null;
  if (raw && !ref) error = "That doesn't look like a GitHub repository. Use owner/name or a github.com URL.";
  else if (ref) {
    try {
      const h = await headers();
      result = await scoreRepo(ref.owner, ref.repo, { ip: clientIp(h), withRules: true });
    } catch (err) {
      error = err instanceof ScanError ? err.message : "Something went wrong while scanning that repository.";
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <header className="text-center">
        <p className="pill mx-auto w-fit">New</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">How agent-ready is your repo?</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--color-muted)]">
          Get a 0–100 score for how safely and cheaply AI coding agents can work in a repository — instructions, feedback loop, security and token cost — with the exact fixes and a README badge.
        </p>
        <form action="/score" method="get" className="mx-auto mt-6 flex max-w-xl gap-2">
          <label htmlFor="repo" className="sr-only">GitHub repository</label>
          <input
            id="repo"
            name="repo"
            defaultValue={ref ? `${ref.owner}/${ref.repo}` : raw.slice(0, 200)}
            placeholder="owner/repo or https://github.com/owner/repo"
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            required
            className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
          <button type="submit" className="btn-primary">Score it</button>
        </form>
        <p className="mt-2 text-xs text-[var(--color-muted)]">Public repositories only. Nothing is stored except the score.</p>
      </header>

      {error && (
        <div role="alert" className="mx-auto mt-8 max-w-xl rounded-[var(--radius-md)] border border-[var(--color-danger)]/40 p-4 text-center text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {result && <Result r={result} />}
    </div>
  );
}
