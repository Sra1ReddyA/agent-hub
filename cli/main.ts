import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { filesToWrite } from "../src/lib/agent-hub/diff";
import { buildBundle, DEFAULT_MODE, DEFAULT_TARGETS, type GenerationMode } from "../src/lib/agent-hub/generator";
import { analyzeCodebase } from "../src/lib/agent-hub/scan/codebase";
import { buildKnowledgeSeed } from "../src/lib/agent-hub/scan/knowledgeSeed";
import { scoreFacts, type ScoreReport } from "../src/lib/agent-hub/scan/score";
import type { RepoSnapshot } from "../src/lib/agent-hub/scan/types";
import { STACKS, type StackId } from "../src/lib/agent-hub/stacks";
import { TARGETS, type TargetId } from "../src/lib/agent-hub/targets";
import { TEMPLATE_CONTENT_VERSION } from "../src/lib/agent-hub/version";
import { snapshotFromDisk } from "./local";

/**
 * `agent-hub` command line: score a local repo for AI-agent readiness, or generate the agent files for it.
 * Everything runs locally and offline — no network, no telemetry, nothing is executed from the scanned repo.
 *
 *   agent-hub score [dir] [--json] [--min N]
 *   agent-hub init  [dir] [--stacks a,b] [--targets a,b] [--mode combined|modular] [--ci] [--force] [--dry-run]
 */

export type IO = { out: (s: string) => void; err: (s: string) => void; color: boolean };

const HELP = `agent-hub ${TEMPLATE_CONTENT_VERSION} — make a repo ready for AI coding agents

Usage:
  agent-hub score [dir]   Score how agent-ready a repo is (0-100) and list the fixes
      --json              Machine-readable output
      --min <0-100>       Exit with code 1 if the score is below this (use in CI)
  agent-hub init [dir]    Generate agent instruction files, tailored to the repo
      --stacks a,b        Override the detected stacks (ids: see 'agent-hub list')
      --targets a,b       Tools to generate for (default: ${DEFAULT_TARGETS.join(",")})
      --mode <m>          combined (default) or modular
      --ci                Also write the CI guardrail check workflow
      --force             Overwrite existing generated files (never the knowledge base)
      --dry-run           Show what would be written, change nothing
  agent-hub list          List stack and target ids
  agent-hub --help | --version
`;

type Args = { cmd: string; dir: string; flags: Map<string, string | true>; bad: string | null };

function parseArgs(argv: string[]): Args {
  const [cmd = "--help", ...rest] = argv;
  const flags = new Map<string, string | true>();
  let dir = ".";
  let bad: string | null = null;
  const valued = new Set(["min", "stacks", "targets", "mode"]);
  const boolean = new Set(["json", "ci", "force", "dry-run", "help", "version"]);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (valued.has(name)) {
        const v = rest[++i];
        if (v === undefined || v.startsWith("--")) bad = `--${name} needs a value`;
        else flags.set(name, v);
      } else if (boolean.has(name)) flags.set(name, true);
      else bad = `unknown option ${a}`;
    } else dir = a;
  }
  return { cmd, dir, flags, bad };
}

const paint = (io: IO, code: string, s: string) => (io.color ? `\x1b[${code}m${s}\x1b[0m` : s);
const colorFor = (n: number) => (n >= 85 ? "32" : n >= 65 ? "33" : n >= 40 ? "33" : "31");

function bar(points: number, max: number): string {
  const filled = Math.round((points / max) * 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function printReport(io: IO, report: ScoreReport) {
  io.out(`\n${paint(io, "1", "Agent-Readiness Score")}  ${paint(io, colorFor(report.total), `${report.total}/100`)}  ${paint(io, colorFor(report.total), report.label)}\n\n`);
  for (const c of report.categories) io.out(`  ${c.label.padEnd(24)} ${bar(c.points, c.max)} ${String(c.points).padStart(2)}/${c.max}\n`);
  if (report.nextSteps.length > 0) {
    io.out(`\n${paint(io, "1", "Fix these first")}\n`);
    report.nextSteps.forEach((s, i) => io.out(`  ${i + 1}. ${s.label} (+${s.max - s.points} pts)\n     ${paint(io, "2", s.fix ?? "")}\n`));
  }
  io.out(`\n${report.facts.agent.maxTokens > 0 ? `Instruction file ≈ ${report.facts.agent.maxTokens.toLocaleString("en-US")} tokens per request. ` : ""}Security checks are heuristics over a sample of files, not an audit.\n`);
}

function resolveRoot(dir: string, io: IO): string | null {
  const root = resolve(dir);
  try {
    if (!statSync(root).isDirectory()) throw new Error("not a directory");
  } catch {
    io.err(`agent-hub: '${dir}' is not a directory\n`);
    return null;
  }
  return root;
}

function csv(v: string | true | undefined): string[] | null {
  return typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : null;
}

export function run(argv: string[], io: IO): number {
  const args = parseArgs(argv);
  if (args.bad) {
    io.err(`agent-hub: ${args.bad}\n${HELP}`);
    return 2;
  }
  const { cmd, flags } = args;

  if (cmd === "--help" || cmd === "-h" || cmd === "help" || flags.has("help")) {
    io.out(HELP);
    return 0;
  }
  if (cmd === "--version" || cmd === "-v" || flags.has("version")) {
    io.out(`${TEMPLATE_CONTENT_VERSION}\n`);
    return 0;
  }
  if (cmd === "list") {
    io.out(`Stacks:\n${STACKS.map((s) => `  ${s.id.padEnd(14)} ${s.label}`).join("\n")}\n\nTargets:\n${TARGETS.map((t) => `  ${t.id.padEnd(16)} ${t.label}`).join("\n")}\n`);
    return 0;
  }

  if (cmd === "score") {
    const root = resolveRoot(args.dir, io);
    if (!root) return 2;
    const min = flags.has("min") ? Number(flags.get("min")) : null;
    if (min !== null && (!Number.isFinite(min) || min < 0 || min > 100)) {
      io.err("agent-hub: --min must be a number from 0 to 100\n");
      return 2;
    }
    const report = scoreFacts(analyzeCodebase(snapshotFromDisk(root)));
    if (flags.has("json")) {
      const { facts, ...rest } = report;
      io.out(`${JSON.stringify({ ...rest, stacks: facts.stacks, commands: facts.commands, agentFiles: facts.agent.files }, null, 2)}\n`);
    } else printReport(io, report);
    if (min !== null && report.total < min) {
      io.err(`agent-hub: score ${report.total} is below the required minimum ${min}\n`);
      return 1;
    }
    return 0;
  }

  if (cmd === "init") {
    const root = resolveRoot(args.dir, io);
    if (!root) return 2;

    const snapshot: RepoSnapshot = snapshotFromDisk(root);
    const facts = analyzeCodebase(snapshot);

    const knownStacks = new Set<string>(STACKS.map((s) => s.id));
    const knownTargets = new Set<string>(TARGETS.map((t) => t.id));
    const stackArg = csv(flags.get("stacks"));
    const targetArg = csv(flags.get("targets"));
    const unknownStack = stackArg?.find((s) => !knownStacks.has(s));
    const unknownTarget = targetArg?.find((t) => !knownTargets.has(t));
    if (unknownStack || unknownTarget) {
      io.err(`agent-hub: unknown ${unknownStack ? `stack '${unknownStack}'` : `target '${unknownTarget}'`} (see 'agent-hub list')\n`);
      return 2;
    }
    const modeArg = flags.get("mode");
    if (modeArg !== undefined && modeArg !== "combined" && modeArg !== "modular") {
      io.err("agent-hub: --mode must be 'combined' or 'modular'\n");
      return 2;
    }

    const stacks = (stackArg ?? facts.stacks) as StackId[];
    if (stacks.length === 0) {
      io.err("agent-hub: couldn't detect a stack in this directory. Pass --stacks (see 'agent-hub list').\n");
      return 1;
    }
    const targets = (targetArg ?? DEFAULT_TARGETS) as TargetId[];
    const mode: GenerationMode = (modeArg as GenerationMode | undefined) ?? DEFAULT_MODE;

    const files = buildBundle(stacks, targets, mode, { includeCiCheck: flags.has("ci"), knowledgeSeed: buildKnowledgeSeed(facts) });

    // Resolve every destination inside the project root (defence in depth; generated paths are static).
    const dest = (p: string) => {
      const full = resolve(root, p);
      if (full !== root && !full.startsWith(root + sep)) throw new Error(`refusing to write outside the project: ${p}`);
      return full;
    };
    const existing = files.map((f) => (existsSync(dest(f.path)) ? readFileSync(dest(f.path), "utf-8") : null));
    const force = flags.has("force");
    // Without --force, never touch a file that already exists (it may hold hand-written rules).
    const toWrite = filesToWrite(files, existing).filter((f) => force || existing[files.indexOf(f)] === null);
    const skipped = files.filter((f) => !toWrite.includes(f));

    io.out(`Detected stacks: ${stacks.join(", ")}\n`);
    for (const f of toWrite) io.out(`  ${flags.has("dry-run") ? "would write" : "write"}  ${f.path}\n`);
    for (const f of skipped) io.out(`  ${paint(io, "2", `keep   ${f.path}${f.createOnly ? " (agent-maintained)" : ""}`)}\n`);

    if (!flags.has("dry-run")) {
      for (const f of toWrite) {
        mkdirSync(dirname(dest(f.path)), { recursive: true });
        writeFileSync(dest(f.path), f.content, "utf-8");
      }
    }

    const before = scoreFacts(facts).total;
    const overlay: RepoSnapshot = { paths: [...new Set([...snapshot.paths, ...toWrite.map((f) => f.path)])], files: { ...snapshot.files, ...Object.fromEntries(toWrite.map((f) => [f.path, f.content])) } };
    const after = scoreFacts(analyzeCodebase(overlay)).total;
    io.out(`\nAgent-Readiness Score: ${before} → ${paint(io, colorFor(after), String(after))}${flags.has("dry-run") ? " (projected)" : ""}\n`);
    io.out(`Next: review the files, commit them, and run 'agent-hub score --min 70' in CI.\n`);
    return 0;
  }

  io.err(`agent-hub: unknown command '${cmd}'\n${HELP}`);
  return 2;
}
