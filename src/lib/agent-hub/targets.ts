import type { GeneratedFile } from "./types";

/**
 * Agent Hub — target catalogue. A "target" is one AI coding tool's own file format/location for reading
 * repo-level instructions. The same generated Master Agent content (from `templates/masterAgent.ts`) is
 * wrapped differently per target — a Cursor `.mdc` file gets YAML frontmatter, Claude Code gets a root
 * `CLAUDE.md`, Windsurf gets one flat `.windsurfrules` file, and so on — so one stack pick produces a
 * correct, idiomatic file for every tool a repo's contributors might actually be using, not just one.
 */
export type TargetId = "github-copilot" | "claude-code" | "cursor" | "windsurf" | "cline" | "continue" | "aider" | "agents-md";

/** How a target's files decompose when MULTIPLE stacks are generated in "Modular" mode:
 * - "anchor+item": a shared root anchor file, plus one detail file per stack (GitHub Copilot, Claude Code).
 * - "item-only": one file per stack, no shared root at all (Cursor, Cline, Continue).
 * - "anchor-only": a single flat file with no per-stack sub-file convention (Windsurf, Aider, AGENTS.md) —
 *   for these, true per-stack modularity isn't representable in the tool's own format, so Modular mode
 *   falls back to the same merged content Combined mode would produce, for that target only. This is a
 *   documented tool limitation, not a bug: it's a direct consequence of each tool only reading one fixed
 *   filename with no subfolder-of-rules convention. */
export type TargetShape = "anchor+item" | "item-only" | "anchor-only";

/** The minimal per-agent info a target needs to build its file(s) — deliberately narrower than the full
 * `Stack` type so `targets.ts` has no dependency on `stacks.ts` and can wrap either one real stack or a
 * synthetic "combined" descriptor built from several stacks. */
export type AgentMeta = { slug: string; label: string; tagline: string; fileGlobs: string[] };

export type Target = {
  id: TargetId;
  label: string;
  vendor: string;
  shape: TargetShape;
  /** One-line pitch shown in the target picker. */
  blurb: string;
  /** Paths this target writes, shown in the picker before generating (uses <slug> as a placeholder). */
  pathsPreview: string[];
  /** How the tool discovers/reads the file — shown on hover and in the Guides page. */
  howItsRead: string;
  /** Ordered setup steps for the Guides page's per-tool section. */
  setupSteps: string[];
  /** Official docs link, cited on the Guides page — never fabricated, always the vendor's own docs domain. */
  docsUrl: string;
};

export const TARGETS: Target[] = [
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    vendor: "GitHub",
    shape: "anchor+item",
    blurb: "Repo-wide custom instructions Copilot Chat, code review and the coding agent all read automatically — nothing to enable in the editor.",
    pathsPreview: [".github/copilot-instructions.md", ".github/agents/<slug>-agent.md"],
    howItsRead: "Copilot Chat (VS Code, JetBrains, Visual Studio, github.com) loads .github/copilot-instructions.md automatically on every chat turn inside the repo.",
    setupSteps: [
      "Extract the zip at your repository root so .github/ sits next to package.json / pyproject.toml / go.mod / etc.",
      "Commit both files — Copilot reads copilot-instructions.md automatically, with no setting to flip.",
      "Open Copilot Chat in VS Code, JetBrains or Visual Studio and ask a repo question — the response will reflect the instructions.",
      "On github.com, Copilot code review and the Copilot coding agent read the same file for PR-level suggestions and autonomous tasks.",
    ],
    docsUrl: "https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    vendor: "Anthropic",
    shape: "anchor+item",
    blurb: "A root CLAUDE.md Claude Code loads at the start of every session, plus an installable subagent under .claude/agents/.",
    pathsPreview: ["CLAUDE.md", ".claude/agents/<slug>-agent.md"],
    howItsRead: "Claude Code reads CLAUDE.md from the repository root (and any parent directory) automatically when it starts a session in this project.",
    setupSteps: [
      "Extract the zip at your repository root so CLAUDE.md and .claude/ sit next to your project's top-level files.",
      "Commit CLAUDE.md — Claude Code loads it automatically for everyone working in the repo, no configuration needed.",
      "Optional: run /agents inside Claude Code to see the generated subagent(s) listed, or invoke one directly by name for a focused task.",
      "Run claude in the repo root and ask it to make a change — it will follow the directives without being reminded.",
    ],
    docsUrl: "https://docs.claude.com/en/docs/claude-code/memory",
  },
  {
    id: "cursor",
    label: "Cursor",
    vendor: "Anysphere",
    shape: "item-only",
    blurb: "A project rule under .cursor/rules/*.mdc, set to always-apply so it's active in every Cursor chat and Tab completion in this repo.",
    pathsPreview: [".cursor/rules/<slug>-agent.mdc"],
    howItsRead: "Cursor reads every .mdc file under .cursor/rules/ at project load; alwaysApply: true in its frontmatter means it's attached to every request without you mentioning it.",
    setupSteps: [
      "Extract the zip at your repository root so .cursor/rules/ sits at the project root.",
      "Commit the .mdc file(s) — Cursor picks up project rules automatically the next time the project is opened.",
      "Open Cursor Settings → Rules to confirm each rule is listed and enabled if you want to double-check.",
      "Start a Cursor Chat or Composer session in the repo — every always-apply rule applies without needing to be pasted in.",
    ],
    docsUrl: "https://docs.cursor.com/context/rules",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    vendor: "Cognition",
    shape: "anchor-only",
    blurb: "A single flat .windsurfrules file at the repo root, read automatically by Windsurf's Cascade agent.",
    pathsPreview: [".windsurfrules"],
    howItsRead: "Windsurf's Cascade agent reads .windsurfrules from the workspace root automatically on every request in that workspace.",
    setupSteps: [
      "Extract the zip at your repository root so .windsurfrules sits next to your project's top-level files.",
      "Commit the file — Cascade picks it up automatically the next time the workspace is opened.",
      "Windsurf reads one flat file, so a multi-stack selection is always merged into one file for this tool, the same way Combined mode works for every target.",
      "Start a Cascade conversation in the repo and ask it to make a change — it will follow the directives without being reminded.",
    ],
    docsUrl: "https://docs.windsurf.com/windsurf/cascade/memories",
  },
  {
    id: "cline",
    label: "Cline",
    vendor: "Cline (VS Code extension)",
    shape: "item-only",
    blurb: "A project rule file under .clinerules/, toggled on or off per-rule from the Cline sidebar.",
    pathsPreview: [".clinerules/<slug>-agent.md"],
    howItsRead: "Cline reads every file under .clinerules/ in the workspace and lists them as toggleable rules in its sidebar; enabled rules are included in context automatically.",
    setupSteps: [
      "Extract the zip at your repository root so .clinerules/ sits at the project root.",
      "Commit the file(s) — open the Cline sidebar's Rules section to confirm each is listed and toggled on.",
      "Start a new Cline task in the repo — enabled rules are included in context without pasting them in.",
    ],
    docsUrl: "https://docs.cline.bot/features/cline-rules",
  },
  {
    id: "continue",
    label: "Continue.dev",
    vendor: "Continue",
    shape: "item-only",
    blurb: "A rule block under .continue/rules/, picked up by the Continue extension for VS Code and JetBrains.",
    pathsPreview: [".continue/rules/<slug>-agent.md"],
    howItsRead: "Continue reads Markdown rule files under .continue/rules/ in the workspace and applies them to chat and autocomplete requests in that project.",
    setupSteps: [
      "Extract the zip at your repository root so .continue/rules/ sits at the project root.",
      "Commit the file(s) — Continue picks up workspace rules automatically the next time the project loads.",
      "Open the Continue panel and ask it to make a change in the repo — the rule(s) apply without being pasted in.",
    ],
    docsUrl: "https://docs.continue.dev/customize/deep-dives/rules",
  },
  {
    id: "aider",
    label: "Aider",
    vendor: "Aider (open source)",
    shape: "anchor-only",
    blurb: "A plain CONVENTIONS.md plus an .aider.conf.yml snippet that tells Aider to read it on every run.",
    pathsPreview: ["CONVENTIONS.md", ".aider.conf.yml"],
    howItsRead: "Aider doesn't auto-discover a conventions file by name — it reads whatever file(s) the read: option in .aider.conf.yml (or the --read flag) points at, on every run.",
    setupSteps: [
      "Extract the zip at your repository root so CONVENTIONS.md and .aider.conf.yml sit at the project root.",
      "If you already have an .aider.conf.yml, merge in the generated read: line instead of overwriting your file.",
      "Commit both files — anyone running aider in the repo now gets the conventions loaded automatically.",
      "Aider reads one plain file, so a multi-stack selection is always merged into one CONVENTIONS.md, the same way Combined mode works for every target.",
    ],
    docsUrl: "https://aider.chat/docs/usage/conventions.html",
  },
  {
    id: "agents-md",
    label: "AGENTS.md (Universal)",
    vendor: "Open, multi-vendor convention",
    shape: "anchor-only",
    blurb: "One plain-Markdown AGENTS.md at the repo root — the emerging open convention already read by OpenAI Codex, Jules, Amp, RooCode and others, and a sane fallback for any tool without dedicated support here.",
    pathsPreview: ["AGENTS.md"],
    howItsRead: "Tools built on the AGENTS.md convention look for this exact filename at the repository root (or nearest parent) and load it automatically — no per-tool configuration.",
    setupSteps: [
      "Extract the zip at your repository root so AGENTS.md sits next to your project's top-level files.",
      "Commit it — any AGENTS.md-aware tool picks it up automatically with no setup.",
      "AGENTS.md is one flat file by convention, so a multi-stack selection is always merged into one file here, the same way Combined mode works for every target.",
    ],
    docsUrl: "https://agents.md/",
  },
];

export const getTarget = (id: TargetId) => TARGETS.find((t) => t.id === id)!;

/** Escapes a string for safe use inside a double-quoted YAML scalar (frontmatter values). */
function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function agentSlugOf(meta: AgentMeta): string {
  return `${meta.slug}-agent`;
}

function copilotAnchor(meta: AgentMeta, agentPath: string): string {
  return `# Repository Instructions

This repository uses **${meta.label}** (${meta.tagline}). These instructions apply to every AI coding
assistant working in this repo, including GitHub Copilot Chat, Copilot code review and the Copilot coding
agent.

## Read first
\`${agentPath}\` — the consolidated ${meta.label} Master Agent. It is the single source of truth for how
this repo's ${meta.label} code should be written and reviewed: token/context discipline, comprehensive
test generation, OWASP-aligned security review, and ${meta.label} idioms are all enforced together by
that one file's 10 Core Operating Directives — there is no separate instructions/agents split to keep in
sync.

## House rules
- Prefer the smallest correct diff over a broad rewrite.
- Match existing conventions in the file being edited before introducing a new one.
- Never invent an API, package, or file that doesn't exist in this repo — check first.
- After any feature, API change, or refactor, update \`README.md\` to reflect it (see Directive 10 in
  \`${agentPath}\`) — this is mandatory, not optional.
- If a request is ambiguous and there's a reasonable default, take it and say so; don't block on a
  clarifying question when the codebase already answers it.
`;
}

function claudeMd(agentBody: string): string {
  return `${agentBody}
---

_This file is CLAUDE.md — Claude Code loads it automatically from the repository root at the start of
every session. Generated by Agent Hub._
`;
}

function claudeSubagentFrontmatter(meta: AgentMeta): string {
  return `---
name: ${agentSlugOf(meta)}
description: ${meta.label} specialist — invoke for any ${meta.label} change, review, or question in this repository. Use PROACTIVELY for ${meta.label} code.
---

`;
}

function cursorFrontmatter(meta: AgentMeta): string {
  return `---
description: ${yamlQuote(`${meta.label} Master Agent — ${meta.tagline}`)}
globs: ${yamlQuote(meta.fileGlobs.join(", "))}
alwaysApply: true
---

`;
}

const AIDER_CONF = `# Generated by Agent Hub — tells Aider to load your conventions on every run.
# If you already have an .aider.conf.yml, merge this key into it instead of overwriting the file.
read: CONVENTIONS.md
`;

/** Wraps the shared Master Agent body into the correct file(s) for one target/tool, for ONE agent
 * (a single stack, or a synthetic "combined" descriptor covering several). `agentBody` is the output of
 * `buildMasterAgent(stack)` or `buildCombinedMasterAgent(stacks)` — identical content, different
 * packaging per tool. This is the only function most callers need; the two below exist specifically to
 * decompose a multi-stack "Modular" bundle into a shared root + N per-stack detail files. */
export function buildTargetFiles(target: TargetId, meta: AgentMeta, agentBody: string): GeneratedFile[] {
  const agentSlug = agentSlugOf(meta);

  switch (target) {
    case "github-copilot": {
      const agentPath = `.github/agents/${agentSlug}.md`;
      return [
        { path: ".github/copilot-instructions.md", content: copilotAnchor(meta, agentPath) },
        { path: agentPath, content: agentBody },
      ];
    }
    case "claude-code":
      return [
        { path: "CLAUDE.md", content: claudeMd(agentBody) },
        { path: `.claude/agents/${agentSlug}.md`, content: claudeSubagentFrontmatter(meta) + agentBody },
      ];
    case "cursor":
      return [{ path: `.cursor/rules/${agentSlug}.mdc`, content: cursorFrontmatter(meta) + agentBody }];
    case "windsurf":
      return [{ path: ".windsurfrules", content: agentBody }];
    case "cline":
      return [{ path: `.clinerules/${agentSlug}.md`, content: agentBody }];
    case "continue":
      return [{ path: `.continue/rules/${agentSlug}.md`, content: agentBody }];
    case "aider":
      return [
        { path: "CONVENTIONS.md", content: agentBody },
        { path: ".aider.conf.yml", content: AIDER_CONF },
      ];
    case "agents-md":
      return [{ path: "AGENTS.md", content: agentBody }];
  }
}

/** Modular multi-stack mode, "anchor+item"/"item-only" targets only: the per-stack detail file alone, with
 * no root anchor (the anchor is built once, separately, by `buildSharedRootFile`). Returns `null` for an
 * "anchor-only" target, which has no per-stack file convention to decompose into. */
export function buildModularItemFile(target: TargetId, meta: AgentMeta, agentBody: string): GeneratedFile | null {
  const info = getTarget(target);
  const agentSlug = agentSlugOf(meta);
  switch (info.shape) {
    case "anchor+item":
      return target === "github-copilot"
        ? { path: `.github/agents/${agentSlug}.md`, content: agentBody }
        : { path: `.claude/agents/${agentSlug}.md`, content: claudeSubagentFrontmatter(meta) + agentBody };
    case "item-only":
      return buildTargetFiles(target, meta, agentBody)[0];
    case "anchor-only":
      return null;
  }
}

/** Modular multi-stack mode: the ONE shared root/anchor file for a target, built from `sharedBody` (the
 * Universal Guardrails + Cross-Stack Guardrails + end-of-session reporting rule + an index of every
 * per-stack file — see `generator.ts`), plus a short line naming every stack in the selection. For an
 * "item-only" target (Cursor, Cline, Continue) there is no shared root file at all — returns `null`. For
 * an "anchor-only" target (Windsurf, Aider, AGENTS.md), `sharedBody` should already be the FULL merged
 * content, since there is nowhere else for per-stack detail to live for that tool. */
export function buildSharedRootFile(target: TargetId, metas: AgentMeta[], sharedBody: string): GeneratedFile | null {
  const info = getTarget(target);
  const stackList = metas.map((m) => m.label).join(", ");

  switch (info.shape) {
    case "item-only":
      return null;
    case "anchor-only":
      return buildTargetFiles(target, metas[0], sharedBody).find((f) => f.path !== ".aider.conf.yml") ?? null;
    case "anchor+item": {
      if (target === "github-copilot") {
        const index = metas.map((m) => `- **${m.label}** → \`.github/agents/${agentSlugOf(m)}.md\``).join("\n");
        const anchor = `# Repository Instructions (Multi-Stack — Modular)

This repository uses: **${stackList}**. Each stack has its own detailed Master Agent file below; the
guardrails in this file apply across all of them.

## Stack-specific agent files
${index}

${sharedBody}
`;
        return { path: ".github/copilot-instructions.md", content: anchor };
      }
      // claude-code
      const index = metas.map((m) => `- **${m.label}** → \`.claude/agents/${agentSlugOf(m)}.md\` (invoke by name, or via /agents)`).join("\n");
      const anchor = `# Repository Instructions (Multi-Stack — Modular)

This repository uses: **${stackList}**. Each stack has its own detailed Claude Code subagent below; the
guardrails in this file apply across all of them and are loaded automatically every session.

## Stack-specific subagents
${index}

${sharedBody}

---

_This file is CLAUDE.md — Claude Code loads it automatically from the repository root at the start of
every session. Generated by Agent Hub._
`;
      return { path: "CLAUDE.md", content: anchor };
    }
  }
}
