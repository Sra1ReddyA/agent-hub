import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { faqLd, pageMetadata } from "@/lib/seo";
import { TARGETS } from "@/lib/agent-hub/targets";

export const metadata = pageMetadata({
  title: "Guides — How to Use AI Coding Agent Instructions",
  description:
    "What an AI coding agent instruction file actually is, how GitHub Copilot, Claude Code, Cursor, Windsurf, Cline, Continue.dev, Aider and AGENTS.md each read theirs, and how to write and customize directives that actually change agent behavior.",
  path: "/guides",
  keywords: ["how to use github copilot instructions", "claude code CLAUDE.md guide", "cursor rules guide", "how to write ai agent instructions"],
});

const GUIDE_FAQS = [
  {
    q: "Do I need to pick just one AI coding tool?",
    a: "No. Generate for every tool anyone on your team actually uses — the files don't conflict, and most teams end up with two or three (say, Claude Code + Cursor, or Copilot + AGENTS.md as a fallback for everything else).",
  },
  {
    q: "Will my team actually follow a file like this?",
    a: "The file governs the AI agent's behavior, not your teammates' — it's not a style guide people have to read, it's the context an agent reads before every change so it stops needing to be told the same thing every session.",
  },
  {
    q: "What if two directives conflict with how my codebase actually works?",
    a: "Edit the file. It's a generated starting point, not a contract — trim or reword anything that doesn't match your team's real conventions before committing it. See \"What to customize first\" below.",
  },
  {
    q: "Do these files replace code review?",
    a: "No — they raise the floor on what an AI agent produces before a human ever looks at it. Treat the agent's output the way you'd treat a capable but new teammate's first draft: reviewed, not rubber-stamped.",
  },
];

function Toc() {
  const items = [
    { href: "#what", label: "What these files actually do" },
    { href: "#directives", label: "The 10 Core Operating Directives" },
    { href: "#tools", label: "Per-tool setup guide" },
    { href: "#customize", label: "What to customize first" },
    { href: "#writing", label: "Writing directives that actually work" },
    { href: "#multi-agent", label: "One master agent vs. many small ones" },
    { href: "#faq", label: "Questions" },
  ];
  return (
    <nav aria-label="On this page" className="card sticky top-20 hidden max-h-[calc(100vh-6rem)] shrink-0 overflow-auto p-4 lg:block lg:w-56">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">On this page</p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.href}>
            <a href={i.href} className="block rounded-[var(--radius-md)] px-2 py-1 text-[var(--color-muted)] hover:bg-[var(--color-border)]/40 hover:text-[var(--color-ink)]">
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <JsonLd data={[faqLd(GUIDE_FAQS)]} />

      <header className="mx-auto max-w-2xl text-center">
        <p className="mx-auto inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" /> Guides
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">How to actually use these files</h1>
        <p className="mt-3 text-[var(--color-muted)]">
          Generating the bundle is the easy part. This page covers what an agent instruction file changes, how each supported tool discovers and reads its
          own file, what's worth customizing before you commit it, and how to write directives of your own if you'd rather build a bundle by hand.
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-start">
        <Toc />

        <div className="min-w-0 flex-1 space-y-14">
          <section id="what" className="scroll-mt-20">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">What these files actually do</h2>
            <div className="prose-block mt-3 space-y-3 text-sm leading-relaxed text-[var(--color-ink)]">
              <p>
                Every AI coding tool on this list — GitHub Copilot, Claude Code, Cursor, Windsurf, Cline, Continue.dev, Aider — reads some form of
                repository-level context before it starts working: a system prompt it silently prepends to every request in that repo. Left at its
                defaults, that context is generic. It doesn&apos;t know your team formats SQL with parameterized queries, that this repo&apos;s tests live
                next to the code instead of in a mirrored <code>tests/</code> tree, or that a <code>README.md</code> update is expected with every public
                API change.
              </p>
              <p>
                An instruction file replaces that generic default with specifics. It&apos;s not a suggestion the agent might follow — for most of these
                tools it&apos;s literally concatenated into the same context window as your prompt, every single time, so &quot;never hard-code a secret&quot;
                or &quot;use <code>Result&lt;T, E&gt;</code>, not <code>.unwrap()</code>&quot; stops being something you repeat in every session and becomes
                something the agent already knows before you ask.
              </p>
              <p>
                Agent Hub&apos;s generated file goes one step further than a loose list of preferences: it&apos;s built around a fixed set of{" "}
                <a href="#directives" className="font-medium text-[var(--color-accent)] hover:underline">
                  10 Core Operating Directives
                </a>{" "}
                — the things that go wrong in real AI-assisted coding sessions regardless of stack (hallucinated APIs, missing tests, swallowed exceptions,
                stale READMEs) — filled in with your stack&apos;s actual idioms, file globs and anti-patterns.
              </p>
            </div>
          </section>

          <section id="directives" className="scroll-mt-20">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">The 10 Core Operating Directives</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Every generated Master Agent file — for every stack, for every tool — is built around the same ten directives, each filled in with your
              stack&apos;s specifics.
            </p>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Zero Hallucination & Codebase Verification", "Read real files and real dependency versions before proposing a change. Never invent an API, package or config option."],
                ["Strict Type Safety & Schemas", "Full type coverage at every boundary — your stack's own idiom for it, from mypy --strict to Pydantic v2 to Result<T, E>."],
                ["Bug Prevention & Defensive Logic", "Validate edge cases explicitly: empty input, null, zero, negatives, boundary values, unexpected types."],
                ["Token Efficiency", "The minimal correct diff — no full-file reprints, no narrated walkthroughs, no unrequested refactors."],
                ["Comprehensive Unit Testing", "Happy path, edge cases and at least one failure mode for every new or changed unit — mocked, not hitting real infra."],
                ["OWASP & Security Standards", "Every external input is untrusted until validated. No hard-coded secrets. No injection, XSS or unsafe deserialization."],
                ["Performance & Resource Management", "Your stack's actual hot-path concern — N+1 queries, blocked event loops, goroutine leaks, unbounded buffering."],
                ["Architectural Consistency", "Match this repo's existing structure and conventions — flag inconsistency instead of silently picking a third pattern."],
                ["Error Handling & Logging", "Explicit, structured, actionable error handling. No bare catch-and-ignore. No secrets in logs."],
                ["Automated Documentation & README Sync", "Mandatory, not optional: every feature, API or dependency change gets README.md updated in the same pass."],
              ].map(([title, body], i) => (
                <li key={title} className="card p-4">
                  <span className="text-xs font-bold text-[var(--color-accent)]">{i + 1}</span>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-ink)]">{title}</p>
                  <p className="mt-1 text-[13px] leading-snug text-[var(--color-muted)]">{body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="tools" className="scroll-mt-20">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Per-tool setup guide</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Exactly how each supported tool discovers and reads the file(s) Agent Hub generates for it, straight from each vendor&apos;s own docs.
            </p>
            <div className="mt-4 space-y-4">
              {TARGETS.map((t) => (
                <div key={t.id} id={`tool-${t.id}`} className="card scroll-mt-20 p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-[var(--color-ink)]">
                      {t.label} <span className="font-normal text-[var(--color-muted)]">— {t.vendor}</span>
                    </h3>
                    <a href={t.docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[var(--color-accent)] hover:underline">
                      Official docs ↗
                    </a>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{t.blurb}</p>
                  <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">{t.pathsPreview.join("  ·  ")}</p>
                  <p className="mt-3 text-sm text-[var(--color-ink)]">
                    <span className="font-semibold">How it&apos;s read: </span>
                    {t.howItsRead}
                  </p>
                  <ol className="mt-3 space-y-1.5 text-sm text-[var(--color-muted)]">
                    {t.setupSteps.map((step, i) => (
                      <li key={step} className="flex gap-2">
                        <span className="shrink-0 font-mono text-xs font-semibold text-[var(--color-accent)]">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <section id="customize" className="scroll-mt-20">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">What to customize first</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              The generated file is a strong, opinionated default — not a rulebook to commit unread. Before you do, spend five minutes on these:
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Test framework name", "The testing directive says \"whatever this repo already has configured\" — if that's not obviously discoverable (a monorepo with several), name it explicitly: pytest, Vitest, JUnit 5, RSpec."],
                ["Primary surface globs", "Check the file globs match your actual folder layout, especially in a monorepo — a Next.js app under apps/web/ needs apps/web/src/app/**, not the generic src/app/**."],
                ["House rules", "Add anything specific to how your team ships: required PR template sections, a changelog file to update alongside README, a specific branch-naming or commit-message convention."],
                ["Anti-patterns", "Add the two or three mistakes that actually keep showing up in your PRs — the generated list is realistic but generic; your repo's own recurring review comments are more valuable than any template."],
              ].map(([title, body]) => (
                <div key={title} className="card p-4">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="writing" className="scroll-mt-20">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Writing directives that actually work</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Building your own from scratch, or extending a generated file? These hold up across every tool on this list:
            </p>
            <ul className="mt-4 space-y-3 text-sm text-[var(--color-ink)]">
              <li className="card p-4">
                <span className="font-semibold">Be specific, not aspirational.</span>{" "}
                <span className="text-[var(--color-muted)]">
                  &quot;Write clean code&quot; changes nothing — an agent has no way to act on it. &quot;Every public function gets a type hint; run{" "}
                  <code>mypy --strict</code> in CI&quot; is checkable and specific enough to actually follow.
                </span>
              </li>
              <li className="card p-4">
                <span className="font-semibold">State the failure mode, not just the rule.</span>{" "}
                <span className="text-[var(--color-muted)]">
                  &quot;Validate input&quot; is vague. &quot;Treat every request body, query param and header as untrusted until validated — this prevents
                  injection and mass-assignment bugs&quot; gives the agent a reason, which holds up better against edge cases the rule alone doesn&apos;t
                  cover.
                </span>
              </li>
              <li className="card p-4">
                <span className="font-semibold">Prefer a small number of directives enforced consistently over a long list skimmed once.</span>{" "}
                <span className="text-[var(--color-muted)]">
                  Context windows aren&apos;t infinite and attention degrades over a long prompt — ten directives that are always followed beat forty that
                  are half-ignored.
                </span>
              </li>
              <li className="card p-4">
                <span className="font-semibold">Give it a working agreement, not just a list.</span>{" "}
                <span className="text-[var(--color-muted)]">
                  A short, ordered &quot;verify, then write, then review against security/performance, then match conventions, then handle errors, then
                  update docs&quot; sequence at the end turns a list of rules into an actual process the agent runs through.
                </span>
              </li>
              <li className="card p-4">
                <span className="font-semibold">Don&apos;t claim capabilities the tool doesn&apos;t have.</span>{" "}
                <span className="text-[var(--color-muted)]">
                  If your repo has no CI configured yet, don&apos;t write &quot;CI will fail if…&quot; — say what a human reviewer should check instead. An
                  instruction that references infrastructure that doesn&apos;t exist trains the agent (and your reviewers) to ignore the file.
                </span>
              </li>
            </ul>
          </section>

          <section id="multi-agent" className="scroll-mt-20">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">One master agent vs. many small ones</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--color-ink)]">
              <p>
                Early instruction-file setups tend to split concerns into several small files — a{" "}
                <code>security-auditor.md</code>, a <code>test-generator.md</code>, a <code>context-optimizer.md</code>, one specialist file per stack. It
                reads well in a docs folder, but in practice most tools either load every file in the relevant directory on every request (so you&apos;re
                paying the context-window cost of all of them anyway) or require the agent to be explicitly told which specialist to consult, which
                defeats the point of an instruction file being read automatically.
              </p>
              <p>
                Agent Hub deliberately generates <strong>one consolidated Master Agent</strong> per stack instead: token efficiency, testing, security and
                stack idioms all live in the same file, all enforced together, on every change — nothing to keep in sync across files, and nothing an agent
                can partially read.
              </p>
              <p>
                That said, some tools genuinely benefit from a second, narrower file for a specific job — Claude Code&apos;s subagents (
                <code>.claude/agents/*.md</code>) are invoked deliberately for a focused task rather than loaded on every turn, so Agent Hub generates one
                alongside <code>CLAUDE.md</code> for exactly that case. The rule of thumb: if a tool auto-loads everything in a folder, keep it to one file;
                if a tool lets you invoke a specialist by name, a focused specialist file is worth having.
              </p>
            </div>
          </section>

          <section id="faq" className="scroll-mt-20">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Questions</h2>
            <div className="mt-3 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              {GUIDE_FAQS.map((f) => (
                <details key={f.q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-[var(--color-ink)]">
                    {f.q}
                    <span className="text-[var(--color-accent)] transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-[var(--color-muted)]">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="card flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--color-ink)]">Ready to generate your bundle?</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">Pick a stack, pick your tool(s), download the zip.</p>
            </div>
            <Link href="/" className="btn-primary shrink-0 text-sm">
              Open the generator
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
