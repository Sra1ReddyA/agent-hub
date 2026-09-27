import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { faqLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Agent Hub Sync — Keep AI Agent Rules Files Current Automatically",
  description:
    "A GitHub App that watches your repository and opens a pull request whenever your dependencies change or Agent Hub's guardrails are updated — so your CLAUDE.md, .cursorrules or AGENTS.md never silently goes stale.",
  path: "/sync",
  keywords: ["github app ai agent rules sync", "keep cursorrules updated", "AGENTS.md automation", "ai coding agent config bot"],
});

const SYNC_FAQS = [
  {
    q: "What does it actually do?",
    a: "It watches your default branch. On every push, it re-checks your manifests (package.json, requirements.txt, etc.) for stack changes, and separately, once a day, it checks whether Agent Hub's own guardrail content has moved to a new version. Either one can trigger a pull request with the updated files — never a direct push to your default branch.",
  },
  {
    q: "Does it ever push directly to my main branch?",
    a: "No. It only ever commits to one dedicated branch it owns (agent-hub-sync) and opens or updates a pull request from that branch. You review and merge it like any other PR.",
  },
  {
    q: "What if I've customized the generated files?",
    a: "If nothing has changed since the last sync, it does nothing — the check is a real content diff, not a blind overwrite. If something has changed, the PR shows exactly that diff against what's currently committed, including your edits, so you review and merge (or reject) it consciously rather than losing changes silently.",
  },
  {
    q: "Can I configure which stacks, tools or custom rules it uses?",
    a: "Out of the box it starts from a zero-config default: auto-detected stacks, Combined mode, and GitHub Copilot + Claude Code + Cursor. For anything more specific, edit the files directly in the PR it opens — your edits are respected on every subsequent sync as long as nothing upstream has changed for that file.",
  },
  {
    q: "Is my repo's code ever sent to a server?",
    a: "Only what's needed to detect your stack: the contents of a handful of root-level manifest files (package.json, requirements.txt, go.mod, etc.), read directly from GitHub's API using the permissions you grant on install. Nothing is stored beyond the small config needed to run the next sync (which repo, which stacks, which version was last synced).",
  },
];

export default function SyncPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <JsonLd data={[faqLd(SYNC_FAQS)]} />
      <header className="mb-8 text-center">
        <p className="mx-auto inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" /> GitHub App · opens PRs, never pushes to main
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">Agent Hub Sync</h1>
        <p className="mx-auto mt-3 max-w-xl text-[var(--color-muted)]">
          The generator on the homepage gives you a great file once. This keeps it that way — a GitHub App that watches your repo and opens a pull
          request the moment your stack changes or Agent Hub ships new guardrails, so your AI coding agent&apos;s rules never quietly fall behind.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">On every push</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Re-scans your manifests. Added a new framework or database? The next sync notices and opens a PR adding that stack&apos;s guardrails —
            you never have to remember to regenerate by hand.
          </p>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">Once a day</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Checks whether Agent Hub&apos;s own template content has moved to a new version since your last sync — even for a repo that hasn&apos;t
            been touched in weeks. See the <Link href="/changelog" className="underline underline-offset-2">changelog</Link> for what that covers.
          </p>
        </div>
      </div>

      <div className="card mt-6 border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-4">
        <p className="text-sm text-[var(--color-ink)]">
          <strong>Deploy this project first.</strong> GitHub validates the webhook URL when you create the App, so it needs to be a real, publicly
          reachable domain — <code className="font-mono text-xs">NEXT_PUBLIC_SITE_URL</code> can&apos;t be <code className="font-mono text-xs">localhost</code>.
          Run the step below from your deployed site, after setting that env var to your real domain.
        </p>
      </div>

      <div className="card mt-4 p-6">
        <h2 className="font-semibold text-[var(--color-ink)]">Set it up</h2>
        <ol className="mt-3 space-y-3 text-sm text-[var(--color-muted)]">
          <li>
            <strong className="text-[var(--color-ink)]">1. Create your own instance of the App.</strong> Agent Hub Sync isn&apos;t a single
            shared App you install from a marketplace listing — running your own instance means the sync bot only ever has the exact GitHub
            permissions you granted it, on the exact repos you chose, with no shared credentials between different users of this project.
            <div className="mt-2">
              <a href="/api/github/app-manifest" className="btn-primary inline-flex">
                Create your GitHub App →
              </a>
            </div>
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">2. Paste the resulting credentials into your deployment&apos;s env vars and redeploy.</strong>{" "}
            The page after step 1 shows exactly what to paste — it&apos;s the same <code className="font-mono text-xs">.env</code> pattern as
            everything else in this project (see the <Link href="/#" className="underline underline-offset-2">README</Link>&apos;s Environment
            variables section).
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">3. Install it on your repositories.</strong> The same page gives you the install link once
            your App exists. Pick the repos you want kept in sync — it opens its first PR within moments.
          </li>
        </ol>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Questions</h2>
        <div className="mt-3 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {SYNC_FAQS.map((f) => (
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
    </div>
  );
}
