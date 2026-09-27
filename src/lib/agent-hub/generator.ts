import { getStack, type Stack, type StackId } from "./stacks";
import { buildModularItemFile, buildSharedRootFile, buildTargetFiles, getTarget, type AgentMeta, type TargetId } from "./targets";
import { buildCombinedMasterAgent, buildMasterAgent, buildSharedIndexBody } from "./templates/masterAgent";
import { buildComplianceFiles } from "./ci-compliance";

export type { GeneratedFile } from "./types";
import type { GeneratedFile } from "./types";

/** Optional, additive knobs on top of the base stack/target/mode selection — everything here defaults to
 * "off"/"none" so a first-time visitor gets exactly the same bundle as before either was added.
 * `customRules`: free-text team-specific directives (one per line), layered into every generated document
 * exactly once, on top of the stack-specific and universal content. `includeCiCheck`: also emit a GitHub
 * Actions workflow + guardrail-checking script that enforces a subset of the Never Allowed / Security
 * guardrails in CI — see `ci-compliance.ts` for why this is the feature that makes the bundle self-policing
 * instead of a markdown file an agent can quietly ignore. */
export type BundleOptions = { customRules?: string; includeCiCheck?: boolean };

/** "combined" (Option A, default): every selected stack merged into one unified Master Agent — plus a
 * single, tool-agnostic `.agent.md` at the repo root, since that's the one format every AI agent can fall
 * back to reading even without dedicated support. "modular" (Option B): every selected stack gets its own
 * independent file per target; targets with no per-stack file convention (Windsurf, Aider, AGENTS.md) fall
 * back to the same merged content for that target only — see `targets.ts`'s `TargetShape` docs. */
export type GenerationMode = "combined" | "modular";

/** Every target selected by default when a visitor first picks a stack — the three the project has
 * always supported. Everyone else is one click away in the target picker. */
export const DEFAULT_TARGETS: TargetId[] = ["github-copilot", "claude-code", "cursor"];

export const DEFAULT_MODE: GenerationMode = "combined";

/** The universal, tool-agnostic combined output — generated in "combined" mode regardless of which
 * per-tool targets are also selected, because it's the one file format with no vendor lock-in at all. */
export const UNIFIED_AGENT_PATH = ".agent.md";

function stackMeta(stack: Stack): AgentMeta {
  return { slug: stack.slug, label: stack.label, tagline: stack.tagline, fileGlobs: stack.fileGlobs };
}

function combinedMeta(stacks: Stack[]): AgentMeta {
  return {
    slug: stacks.length === 1 ? stacks[0].slug : "fullstack",
    label: stacks.map((s) => s.label).join(" + "),
    tagline: "combined multi-stack agent",
    fileGlobs: [...new Set(stacks.flatMap((s) => s.fileGlobs))],
  };
}

function pushUnique(files: GeneratedFile[], seen: Set<string>, incoming: GeneratedFile[]) {
  for (const f of incoming) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    files.push(f);
  }
}

/** Builds the full bundle for one or more stacks, across one or more targets, in the given generation
 * mode. See `GenerationMode` for what "combined" vs. "modular" actually produce. Paths are deduplicated
 * across targets (and, in modular mode, across stacks) so an overlapping selection never produces two
 * files at the same path. */
export function buildBundle(stackIds: StackId[], targetIds: TargetId[], mode: GenerationMode, options: BundleOptions = {}): GeneratedFile[] {
  const stacks = stackIds.map(getStack);
  if (stacks.length === 0 || targetIds.length === 0) return [];

  const { customRules, includeCiCheck = false } = options;
  const files: GeneratedFile[] = [];
  const seen = new Set<string>();

  // A single stack has nothing to combine or modularize — both modes collapse to the same one-agent output.
  if (mode === "combined" || stacks.length === 1) {
    const body = buildCombinedMasterAgent(stacks, customRules);
    const meta = combinedMeta(stacks);
    if (mode === "combined") pushUnique(files, seen, [{ path: UNIFIED_AGENT_PATH, content: body }]);
    for (const targetId of targetIds) pushUnique(files, seen, buildTargetFiles(targetId, meta, body));
    pushUnique(files, seen, buildComplianceFiles(stacks, includeCiCheck));
    return files;
  }

  // Modular, multiple stacks: each stack gets its own file per target; targets with a genuine per-stack
  // file convention (anchor+item / item-only) get real modularity, one root anchor shared across stacks
  // where the tool has one at all. Targets with no such convention (anchor-only) fall back to the combined
  // body for that target only — see `TargetShape` in targets.ts for why.
  const metas = stacks.map(stackMeta);
  for (const targetId of targetIds) {
    const shape = getTarget(targetId).shape;

    if (shape === "anchor-only") {
      const body = buildCombinedMasterAgent(stacks, customRules);
      pushUnique(files, seen, buildTargetFiles(targetId, combinedMeta(stacks), body));
      continue;
    }

    const sharedBody = buildSharedIndexBody(stacks, customRules);
    const root = buildSharedRootFile(targetId, metas, sharedBody);
    if (root) pushUnique(files, seen, [root]);

    for (const stack of stacks) {
      const item = buildModularItemFile(targetId, stackMeta(stack), buildMasterAgent(stack));
      if (item) pushUnique(files, seen, [item]);
    }
  }
  pushUnique(files, seen, buildComplianceFiles(stacks, includeCiCheck));
  return files;
}

/** Builds a downloadable zip of the bundle and returns it as a Blob. Every file sits at its real
 * project-root-relative path — no wrapper folder — so extracting the zip directly into a project
 * populates `.github/`, `CLAUDE.md`, `.cursor/`, `.agent.md`, etc. immediately. Dynamically imports
 * `jszip` so it never lands in the initial bundle for people who never click download. */
export async function buildBundleZip(
  stackIds: StackId[],
  targetIds: TargetId[],
  mode: GenerationMode,
  options: BundleOptions = {},
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of buildBundle(stackIds, targetIds, mode, options)) zip.file(file.path, file.content);
  return zip.generateAsync({ type: "blob" });
}
