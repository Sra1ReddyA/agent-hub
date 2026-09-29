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

// Every one of these is a real failure mode hit while building and testing this feature against live
// repos, not a hypothetical — see the commit history of `src/lib/github-app/` and `src/app/api/github/` if
// you want the full story behind any one of them. Written as symptom → fix specifically so it's skimmable
// under actual troubleshooting pressure, unlike the FAQ list above which is skimmable for evaluating the
// feature before you've installed anything.
const SYNC_TROUBLESHOOTING = [
  {
    symptom: "Nothing seems to happen after installing the App, or after a push.",
    fix: "Check your deployment's function logs (Vercel: Project → Logs), filtered to \"agent-hub-sync\" — every run logs its outcome there even when nothing visible happens. \"no-manifest-signal\" means no supported manifest file (package.json, requirements.txt, etc.) was found at the repo root. If you see no agent-hub-sync log lines at all, check the App's Advanced tab → Recent Deliveries on GitHub to confirm the webhook is actually reaching your deployment.",
  },
  {
    symptom: "A sync ran (the logs say pr-opened) but I can't find the PR.",
    fix: "GitHub's global Pull Requests inbox filters to PRs that \"involve you\" by some notion GitHub applies internally, and can miss one opened by the bot on a repo you own. Check that repo's own Pull Requests tab directly, not the cross-repo inbox.",
  },
  {
    symptom: "Pushing to main did nothing, but pushing to another branch triggered a sync.",
    fix: "Sync only reacts to pushes on the repository's actual GitHub-configured default branch — whatever it's set to, not necessarily the literal name \"main\". Check Settings → Branches on the repo in question. (A push to a branch with its own open PR can also trigger a comment from Vercel's own preview-deployment bot, which is unrelated to Agent Hub Sync entirely — easy to conflate the two if both fire around the same time.)",
  },
  {
    symptom: "A sync fails with \"Resource not accessible by integration\" pointing at the git/trees API.",
    fix: "The \"Include CI enforcement check\" option writes a GitHub Actions workflow file, which needs the App's separate \"Workflows\" permission — \"Contents\" access alone isn't enough. Apps created through the flow below request it automatically now; if your App predates that, add it under the App's Permissions & webhooks settings on GitHub, save, then accept the updated permissions for the installation (Settings → Installations → Configure). Turning the CI check option off avoids this entirely.",
  },
  {
    symptom: "Right after creating the App, the redirect lands on a 404 (NOT_FOUND) page.",
    fix: "Almost always NEXT_PUBLIC_SITE_URL pointing at a different domain than what's actually deployed — double-check it matches your real production URL exactly (your Vercel project's assigned domain, not a placeholder), then redo the setup flow from that exact URL.",
  },
  {
    symptom: "I closed the sync branch's PR without merging, and the next change opened a new PR instead of reopening it.",
    fix: "Expected, not a bug — Sync only ever updates a currently open PR. Closing one and then pushing another change opens a fresh PR from the same branch rather than reopening the old one.",
  },
];

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
          <strong>Two prerequisites before you start:</strong>
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-ink)]">
          <li>
            <strong>Deploy this project first.</strong> GitHub validates the webhook URL when you create the App, so it needs to be a real,
            publicly reachable domain — <code className="font-mono text-xs">NEXT_PUBLIC_SITE_URL</code> can&apos;t be{" "}
            <code className="font-mono text-xs">localhost</code>. Run step 1 below from your deployed site, after setting that env var to your
            real domain.
          </li>
          <li>
            <strong>Set up Redis first too.</strong> <code className="font-mono text-xs">UPSTASH_REDIS_REST_URL</code> /{" "}
            <code className="font-mono text-xs">UPSTASH_REDIS_REST_TOKEN</code> (a free database from the Vercel Marketplace or upstash.com) —
            Sync has no in-memory fallback like <Link href="/#" className="underline underline-offset-2">/admin</Link>&apos;s analytics does. Skip
            this and everything below will appear to work — the App installs fine, GitHub shows green checkmarks — while every actual sync
            silently does nothing.
          </li>
        </ul>
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
            The page after step 1 lays this out as four copy buttons plus a live check of whether Redis and{" "}
            <code className="font-mono text-xs">CRON_SECRET</code> are already set — it won&apos;t let you miss either one. Same{" "}
            <code className="font-mono text-xs">.env</code> pattern as everything else in this project (see the{" "}
            <Link href="/#" className="underline underline-offset-2">README</Link>&apos;s Environment variables section).
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">3. Install it on your repositories, after the redeploy finishes.</strong> The same page
            gives you the install link once your App exists — wait for step 2&apos;s redeploy to actually complete before clicking it, or the
            first webhook delivery hits the old build.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">4. Verify it worked.</strong> Check{" "}
            <Link href="/admin/sync" className="underline underline-offset-2">/admin/sync</Link> (behind your admin login) — the repo should show
            up with a status within moments. If it doesn&apos;t, the <a href="#troubleshooting" className="underline underline-offset-2">
              troubleshooting section
            </a>{" "}
            below almost certainly has it.
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

      <section id="troubleshooting" className="mt-10 scroll-mt-16">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Troubleshooting</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Real failure modes hit while building this feature, not guesses — if a sync isn&apos;t doing what you expect, one of these is very likely why.
        </p>
        <div className="mt-3 space-y-3">
          {SYNC_TROUBLESHOOTING.map((t) => (
            <div key={t.symptom} className="card p-4">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{t.symptom}</p>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">{t.fix}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
