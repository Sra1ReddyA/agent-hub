import { TEMPLATE_CONTENT_VERSION } from "../version";
import { analyzeCodebase, cmpVersion, type CodebaseFacts } from "./codebase";
import type { RepoSnapshot } from "./types";

/**
 * The Agent-Readiness Score: a 0–100 grade for how well a repository is set up for AI coding agents to work
 * in it safely and cheaply. Deterministic and explainable — every point comes from a named check with a
 * concrete fix — so it works as a badge, a CI gate and a to-do list at once. Five categories:
 *
 *   Instructions (30)  — does an agent know the rules, the commands and the boundaries?
 *   Feedback loop (25) — can an agent verify its own work (tests, lint, types, CI)?
 *   Security (25)      — is the repo itself safe to point an autonomous tool at?
 *   Hygiene (10)       — README, lockfile, lint config.
 *   Efficiency (10)    — is the instruction file current, and small enough not to burn tokens every request?
 */

export type CategoryId = "instructions" | "feedback" | "security" | "hygiene" | "efficiency";

export type Check = {
  id: string;
  category: CategoryId;
  label: string;
  max: number;
  points: number;
  ok: boolean;
  detail?: string;
  /** What to do to earn the missing points. */
  fix?: string;
};

export type CategoryScore = { id: CategoryId; label: string; max: number; points: number };

export type ScoreLabel = "Agent-ready" | "Nearly there" | "Needs work" | "Not ready";

export type ScoreReport = {
  total: number;
  label: ScoreLabel;
  categories: CategoryScore[];
  checks: Check[];
  /** The highest-value failing checks, to show first. */
  nextSteps: Check[];
  facts: CodebaseFacts;
  /** Bump when scoring rules change, so history graphs can note a rubric change instead of a "regression". */
  rubric: number;
};

export const SCORE_RUBRIC_VERSION = 1;

const CATEGORY_LABELS: Record<CategoryId, string> = {
  instructions: "Agent instructions",
  feedback: "Feedback loop",
  security: "Security posture",
  hygiene: "Repo hygiene",
  efficiency: "Freshness & efficiency",
};

export function labelFor(total: number): ScoreLabel {
  if (total >= 85) return "Agent-ready";
  if (total >= 65) return "Nearly there";
  if (total >= 40) return "Needs work";
  return "Not ready";
}

function check(c: Omit<Check, "points" | "ok"> & { ok: boolean; partial?: number }): Check {
  const points = c.ok ? c.max : Math.min(c.partial ?? 0, c.max);
  return { id: c.id, category: c.category, label: c.label, max: c.max, points, ok: c.ok, detail: c.detail, fix: c.fix };
}

const GENERATE_FIX = "Generate one in under a minute with Agent Hub (stack auto-detected from your manifests).";

export function runChecks(f: CodebaseFacts): Check[] {
  const checks: Check[] = [];
  const hasAgent = f.agent.files.length > 0;
  const c = f.commands;

  // ---- Instructions (30) ----
  checks.push(
    check({
      id: "agent-file",
      category: "instructions",
      label: "Has agent instruction files",
      max: 10,
      ok: hasAgent,
      detail: hasAgent ? `${f.agent.files.length} file(s): ${f.agent.files.slice(0, 4).join(", ")}${f.agent.files.length > 4 ? "…" : ""}` : "No CLAUDE.md, AGENTS.md, .cursor/rules, copilot-instructions.md or similar found.",
      fix: GENERATE_FIX,
    }),
    check({
      id: "multi-tool",
      category: "instructions",
      label: "Covers more than one AI tool",
      max: 4,
      ok: f.agent.tools.length >= 2,
      partial: f.agent.tools.length === 1 ? 2 : 0,
      detail: f.agent.tools.length ? `Covers: ${f.agent.tools.join(", ")}` : undefined,
      fix: "Contributors use different assistants — ship the same rules for Claude Code, Cursor and Copilot (or an AGENTS.md) so none of them runs unguided.",
    }),
    check({
      id: "agent-commands",
      category: "instructions",
      label: "Instructions say how to build, test and lint",
      max: 6,
      ok: hasAgent && f.agent.mentionsCommands,
      fix: "List the exact install / test / lint / build commands so the agent verifies its own changes instead of guessing.",
    }),
    check({
      id: "agent-boundaries",
      category: "instructions",
      label: "Instructions state clear boundaries (never / must not)",
      max: 4,
      ok: hasAgent && f.agent.hasBoundaries,
      fix: "Add explicit don'ts: no force-push, no secrets in code, no touching CI or migrations without approval.",
    }),
    check({
      id: "knowledge-base",
      category: "instructions",
      label: "Has a persistent project knowledge base (.agent/knowledge.md)",
      max: 6,
      ok: f.agent.hasKnowledgeBase,
      fix: "Add .agent/knowledge.md (Agent Hub generates a pre-filled one). Agents read it first instead of re-scanning the repo, which cuts tokens on every task.",
    }),
  );

  // ---- Feedback loop (25) ----
  checks.push(
    check({
      id: "test-command",
      category: "feedback",
      label: "Has a runnable test command",
      max: 8,
      ok: Boolean(c.test),
      detail: c.test ? `\`${c.test}\`` : undefined,
      fix: "Add a test script (e.g. a `test` entry in package.json, or a `make test` target) so an agent can prove a change works.",
    }),
    check({
      id: "tests-exist",
      category: "feedback",
      label: "Has tests",
      max: 5,
      ok: f.testFileCount > 0,
      partial: 0,
      detail: f.testFileCount > 0 ? `${f.testFileCount} test file(s)${f.testFramework ? `, ${f.testFramework}` : ""}` : undefined,
      fix: "Add at least a smoke test around your core logic — agents are only as safe as the checks that catch their mistakes.",
    }),
    check({
      id: "static-checks",
      category: "feedback",
      label: "Has a lint or type-check command",
      max: 6,
      ok: Boolean(c.lint || c.typecheck),
      detail: [c.lint, c.typecheck].filter(Boolean).map((x) => `\`${x}\``).join(", ") || undefined,
      fix: "Add a `lint` and/or `typecheck` script — the cheapest, fastest feedback an agent can get.",
    }),
    check({
      id: "ci-present",
      category: "feedback",
      label: "Has CI",
      max: 3,
      ok: f.ci.files.length > 0,
      fix: "Add a CI workflow so agent-written pull requests are checked automatically.",
    }),
    check({
      id: "ci-checks",
      category: "feedback",
      label: "CI runs tests or lint",
      max: 3,
      ok: f.ci.runsTests || f.ci.runsLint,
      partial: 0,
      fix: "Make CI run your test and lint commands on every pull request.",
    }),
  );

  // ---- Security (25) ----
  const sec = f.security;
  checks.push(
    check({
      id: "no-committed-env",
      category: "security",
      label: "No .env files committed",
      max: 5,
      ok: sec.committedEnvFiles.length === 0,
      detail: sec.committedEnvFiles.length ? `Committed: ${sec.committedEnvFiles.slice(0, 3).join(", ")}` : undefined,
      fix: "Remove committed .env files from git history, rotate anything they contained, and keep only a .env.example.",
    }),
    check({
      id: "env-ignored",
      category: "security",
      label: ".env is git-ignored",
      max: 3,
      ok: sec.envIgnored,
      detail: sec.hasGitignore ? undefined : "No .gitignore found.",
      fix: "Add `.env*` (except `.env.example`) to .gitignore.",
    }),
    check({
      id: "no-secrets",
      category: "security",
      label: "No secret-shaped strings in sampled files",
      max: 6,
      ok: sec.secretFindings.length === 0,
      detail: sec.secretFindings.length ? sec.secretFindings.slice(0, 3).map((s) => `${s.kind} in ${s.path}`).join("; ") : `Checked ${sec.sampledSourceFiles} sampled source file(s) and the instruction files.`,
      fix: "Rotate the exposed credential now, move it to an environment variable, and add secret scanning to CI.",
    }),
    check({
      id: "no-token-storage",
      category: "security",
      label: "No auth tokens in localStorage / sessionStorage",
      max: 3,
      ok: sec.tokenStorageFindings.length === 0,
      detail: sec.tokenStorageFindings.length ? `e.g. ${sec.tokenStorageFindings[0].path}` : undefined,
      fix: "Keep tokens in HttpOnly, Secure, SameSite cookies — script-readable storage is stolen by any XSS.",
    }),
    check({
      id: "no-source-maps",
      category: "security",
      label: "Production source maps are not exposed",
      max: 2,
      ok: !sec.sourceMapsEnabled,
      fix: "Disable browser source maps in production builds (or upload them privately to your error tracker).",
    }),
    check({
      id: "dependency-automation",
      category: "security",
      label: "Automated dependency updates (Dependabot / Renovate)",
      max: 3,
      ok: f.hygiene.hasDependencyAutomation,
      fix: "Add .github/dependabot.yml so vulnerable dependencies get a pull request automatically.",
    }),
    check({
      id: "agent-security",
      category: "security",
      label: "Agent instructions include security guidance",
      max: 3,
      ok: hasAgent && f.agent.mentionsSecurity,
      fix: "Add a security checklist to the agent file: injection, XSS, CSRF, authorization, secrets, logging. Agent Hub's bundle includes one tailored to your stack.",
    }),
  );

  // ---- Hygiene (10) ----
  checks.push(
    check({ id: "readme", category: "hygiene", label: "Has a README", max: 3, ok: f.hygiene.hasReadme, fix: "Add a README with what the project is and how to run it." }),
    check({
      id: "lockfile",
      category: "hygiene",
      label: "Dependencies are locked",
      max: 4,
      ok: !f.hygiene.needsLockfile || f.hygiene.hasLockfile,
      fix: "Commit your lockfile so every install (and every agent run) resolves the same versions.",
    }),
    check({
      id: "lint-config",
      category: "hygiene",
      label: "Linter / formatter configured",
      max: 3,
      ok: f.hygiene.hasLintConfig,
      fix: "Add a linter/formatter config so agent-written code matches your style automatically.",
    }),
  );

  // ---- Efficiency (10) ----
  const v = f.agent.generatedVersion;
  const fresh = v ? cmpVersion(v, TEMPLATE_CONTENT_VERSION) >= 0 : false;
  checks.push(
    check({
      id: "fresh",
      category: "efficiency",
      label: "Agent instructions are up to date",
      max: 5,
      ok: hasAgent && fresh,
      // A hand-written file has no version marker, so we can't call it stale — give it most of the credit.
      partial: hasAgent ? (v ? 2 : 3) : 0,
      detail: v ? `Generated by Agent Hub v${v} (current: v${TEMPLATE_CONTENT_VERSION})` : hasAgent ? "No version marker — can't tell how current it is." : undefined,
      fix: v ? "Regenerate (or turn on Agent Hub Sync to get a pull request automatically)." : "Add a dated version marker, or regenerate with Agent Hub so staleness is detectable.",
    }),
  );
  const tokens = f.agent.maxTokens;
  const tokenPoints = !hasAgent ? 0 : tokens <= 8000 ? 5 : tokens <= 12000 ? 3 : tokens <= 20000 ? 1 : 0;
  checks.push({
    id: "token-budget",
    category: "efficiency",
    label: "Instruction file stays cheap to load",
    max: 5,
    points: tokenPoints,
    ok: tokenPoints === 5,
    detail: hasAgent ? `Largest file ≈ ${tokens.toLocaleString("en-US")} tokens, paid on every request.` : undefined,
    fix: "Trim to what changes agent behaviour (≲8k tokens): move reference material to docs the agent can open on demand, and keep project facts in .agent/knowledge.md.",
  });

  return checks;
}

export function scoreFacts(facts: CodebaseFacts): ScoreReport {
  const checks = runChecks(facts);
  const categories = (Object.keys(CATEGORY_LABELS) as CategoryId[]).map((id) => {
    const mine = checks.filter((c) => c.category === id);
    return { id, label: CATEGORY_LABELS[id], max: mine.reduce((s, c) => s + c.max, 0), points: mine.reduce((s, c) => s + c.points, 0) };
  });
  const total = Math.round(categories.reduce((s, c) => s + c.points, 0));
  const nextSteps = checks
    .filter((c) => c.points < c.max && c.fix)
    .sort((a, b) => b.max - b.points - (a.max - a.points) || a.id.localeCompare(b.id))
    .slice(0, 4);
  return { total, label: labelFor(total), categories, checks, nextSteps, facts, rubric: SCORE_RUBRIC_VERSION };
}

/** The one call most code needs: snapshot in, report out. */
export function scoreSnapshot(snapshot: RepoSnapshot): ScoreReport {
  return scoreFacts(analyzeCodebase(snapshot));
}
