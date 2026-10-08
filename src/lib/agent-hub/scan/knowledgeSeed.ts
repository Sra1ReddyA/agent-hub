import { getStack } from "../stacks";
import { KNOWLEDGE_SEED_MD } from "../templates/universalGuardrails";
import type { CodebaseFacts, Commands } from "./codebase";

/**
 * Pre-fills `.agent/knowledge.md` from a repo scan, so on day one the agent already knows the stack, the
 * commands, the layout and the conventions instead of spending tokens on discovering them. Everything here is
 * *detected*, not verified — the heading says so, and the agent is told to confirm by running and to correct
 * anything the code contradicts. With no scan available it falls back to the empty template.
 */

const COMMAND_ROWS: [keyof Commands, string][] = [
  ["install", "install"],
  ["lint", "lint"],
  ["typecheck", "type-check"],
  ["test", "test"],
  ["build", "build"],
  ["dev", "run / dev"],
];

export function buildKnowledgeSeed(facts: CodebaseFacts | null | undefined): string {
  if (!facts) return KNOWLEDGE_SEED_MD;

  const stackLine = facts.stacks.length > 0 ? `- Stack: ${facts.stacks.map((id) => { try { return getStack(id).label; } catch { return id; } }).join(", ")}` : null;

  const commands = COMMAND_ROWS.map(([key, label]) => {
    const cmd = facts.commands[key];
    if (!cmd) return `- ${label}: `;
    const source = facts.commandSources[key];
    return `- ${label}: \`${cmd}\`${source ? ` _(${source})_` : ""}`;
  });

  const map = facts.map.length > 0 ? facts.map.map((m) => `- \`${m.path}\`${m.purpose ? ` — ${m.purpose}` : ""} (${m.files} files)`) : [];

  const conventions = [stackLine, ...facts.conventions.map((c) => `- ${c}`)].filter((l): l is string => Boolean(l));

  return `# Project Knowledge Base
> Agent memory. READ THIS FIRST on every task; UPDATE it before finishing. Keep under ~150 lines, terse.
> Never store secrets, tokens, or personal data. If an entry contradicts the code, trust the code and fix the entry.
> Seeded by Agent Hub from a scan of the repo: detected, not yet run. Confirm commands by running them, then refine.

## Commands (detected — confirm by running)
${commands.join("\n")}

## Map (path -> purpose)
${map.join("\n")}

## Conventions & decisions (why, not just what)
${conventions.join("\n")}

## Pitfalls / gotchas (what broke before, and the fix)

## Open items / next steps
`;
}
