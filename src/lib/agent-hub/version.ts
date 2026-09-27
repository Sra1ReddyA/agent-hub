/**
 * Agent Hub's own version history — for the content of what it generates, not the app's build number.
 *
 * Why this exists: every competing rules generator we've looked at (agentrulegen.com, ai-agent-md.com,
 * boilerplatehub.com, and the rest) is a one-shot, download-and-forget tool. None of them tell you when
 * the rules you downloaded six months ago have fallen behind — and AI coding tools change their own
 * conventions constantly (Cursor's rules format, Copilot's instructions file, what "good" looks like for
 * a stack). A static download goes stale the moment any of that shifts, silently, with nothing telling you.
 *
 * `TEMPLATE_CONTENT_VERSION` is bumped only when the actual generated file content changes (a new
 * guardrail, a new directive, a changed verification command) — not for site-only changes like the admin
 * dashboard. It's embedded as a footer in every generated document and compared against what's stored in
 * the visitor's browser from their last download (see `AgentHub.tsx`), so returning visitors get a plain
 * "this is now out of date" signal instead of silently drifting. That staleness signal — not one more
 * template or one more supported tool — is the actual product differentiator: competitors sell a file,
 * this sells a file that tells you when to come back for a new one.
 */
export const TEMPLATE_CONTENT_VERSION = "1.2.0";

export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  changes: string[];
  /** Whether this release changed the content of generated files (drives the staleness banner) vs. being
   * a site-only change (e.g. the admin dashboard) that doesn't make any existing download out of date. */
  contentChange: boolean;
};

// Newest first.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2.2",
    date: "2026-09-27",
    title: "Agent Hub Sync — keep it current automatically",
    changes: [
      "New: Agent Hub Sync, an optional GitHub App that watches your repo and opens a pull request when your dependencies change or these guardrails are updated, instead of relying on you noticing the banner on this site.",
      "Runs on every push (re-detects your stack) and once a day (checks for a new content version) — see /sync for setup.",
      "Site-only — this doesn't change what a manual download from this page generates, so it doesn't trigger the out-of-date banner below.",
    ],
    contentChange: false,
  },
  {
    version: "1.2.1",
    date: "2026-09-27",
    title: "Usage analytics dashboard",
    changes: [
      "Added a password-protected /admin dashboard for the site owner: total visits, visits per day, most-picked stacks and tools, generation-mode split, and CI-guardrail adoption rate.",
      "Purely operational — this release changes nothing in the files you download, so it doesn't trigger the out-of-date banner below.",
    ],
    contentChange: false,
  },
  {
    version: "1.2.0",
    date: "2026-09-20",
    title: "Team directives, CI enforcement, shareable configs, repo auto-detection",
    changes: [
      "Custom Team-Specific Directives: your own free-text rules, layered into the generated document with explicit precedence over the generic guidance.",
      "Optional CI guardrail check: a GitHub Actions workflow + script that fails a PR on committed secrets, disabled lint/type rules, or a force-push/history-rewrite command — so the rules are enforced, not just suggested.",
      "Shareable config links: your exact stack + mode + target + custom-rules selection encoded into one URL a teammate can open to get the identical setup.",
      "Repo-aware auto-detection: paste a package.json/requirements.txt/go.mod/etc. and the matching stacks are pre-selected for you.",
    ],
    contentChange: true,
  },
  {
    version: "1.1.0",
    date: "2026-09-10",
    title: "Operational Guardrails, Verification Workflow, Git conventions",
    changes: [
      "Operational Guardrails & Safety Boundaries: explicit Always-allowed / Ask-first / Never-allowed tiers for what an agent can do unsupervised.",
      "Verification Workflow: a mandatory self-verification loop plus a real per-stack lint/type-check/test/build command table, instead of a vague \"make sure it works.\"",
      "Git & Pull Request Conventions: branch naming, Conventional Commits, and a PR-description checklist, appearing once per document.",
    ],
    contentChange: true,
  },
  {
    version: "1.0.0",
    date: "2026-08-20",
    title: "Initial multi-stack generator",
    changes: [
      "22 stacks across six categories, combinable into one cross-stack-aware agent or split into per-stack files.",
      "10 Core Operating Directives, Universal Guardrails, and mandatory end-of-session Task Summary & Impact reporting.",
      "Output packaged for 8 AI coding tools: GitHub Copilot, Claude Code, Cursor, Windsurf, Cline, Continue.dev, Aider, and AGENTS.md.",
    ],
    contentChange: true,
  },
];

/** The footer embedded at the bottom of every generated Master Agent document — see the module doc
 * comment above for why this line, on its own, is most of the point. */
export function versionFooter(): string {
  const latest = CHANGELOG[0];
  return `---
_Generated by Agent Hub v${TEMPLATE_CONTENT_VERSION} (content), last content update ${latest.contentChange ? latest.date : CHANGELOG.find((c) => c.contentChange)?.date}. AI coding tool conventions change often — regenerate this file periodically. See what changed: /changelog._`;
}
