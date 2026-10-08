import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeCodebase } from "../src/lib/agent-hub/scan/codebase";
import { scoreSnapshot, scoreFacts } from "../src/lib/agent-hub/scan/score";
import { buildKnowledgeSeed } from "../src/lib/agent-hub/scan/knowledgeSeed";
import { isAgentFile, selectFilesToRead, MAX_FILES_READ } from "../src/lib/agent-hub/scan/select";
import { buildBundle } from "../src/lib/agent-hub/generator";
import { TEMPLATE_CONTENT_VERSION } from "../src/lib/agent-hub/version";
import { snap } from "./helpers";

const PKG = JSON.stringify({
  name: "demo",
  scripts: { dev: "next dev", build: "next build", lint: "eslint .", typecheck: "tsc --noEmit", test: "vitest run" },
  dependencies: { next: "^16.0.0", react: "^19.0.0" },
  devDependencies: { typescript: "^5", vitest: "^2" },
});

const goodRepo = () =>
  snap({
    "package.json": PKG,
    "package-lock.json": "{}",
    "tsconfig.json": '{ "compilerOptions": { "strict": true, "paths": { "@/*": ["./src/*"] } } }',
    ".gitignore": "node_modules\n.env\n.env.*\n!.env.example\n",
    "README.md": "# demo",
    "eslint.config.mjs": "export default []",
    ".github/dependabot.yml": "version: 2",
    ".github/workflows/ci.yml": "jobs:\n  t:\n    steps:\n      - run: npm ci\n      - run: npm test\n      - run: npm run lint\n",
    "src/app/page.tsx": "export default function P(){ return null }",
    "src/lib/util.ts": "export const x = 1;",
    "src/lib/util.test.ts": "import {test} from 'vitest'",
  });

describe("analyzeCodebase", () => {
  it("extracts commands, package manager, tests and structure from a Node repo", () => {
    const f = analyzeCodebase(goodRepo());
    assert.equal(f.packageManager, "npm");
    assert.equal(f.commands.test, "npm test");
    assert.equal(f.commands.lint, "npm run lint");
    assert.equal(f.commands.typecheck, "npm run typecheck");
    assert.equal(f.commands.install, "npm ci");
    assert.equal(f.testFileCount, 1);
    assert.equal(f.testFramework, "Vitest");
    assert.ok(f.stacks.includes("nextjs") && f.stacks.includes("react") && f.stacks.includes("typescript"));
    assert.ok(f.conventions.some((c) => c.includes("strict")));
    assert.ok(f.conventions.some((c) => c.includes("@/*")));
    assert.ok(f.map.some((m) => m.path === "src/" && m.purpose === "application source"));
    assert.ok(f.ci.runsTests && f.ci.runsLint);
  });

  it("ignores the npm placeholder test script", () => {
    const f = analyzeCodebase(snap({ "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }));
    assert.equal(f.commands.test, undefined);
  });

  it("uses pnpm / yarn from lockfiles and the packageManager field", () => {
    assert.equal(analyzeCodebase(snap({ "package.json": "{}", "pnpm-lock.yaml": "" })).packageManager, "pnpm");
    assert.equal(analyzeCodebase(snap({ "package.json": JSON.stringify({ packageManager: "yarn@4.1.0" }) })).packageManager, "yarn");
  });

  it("derives Python commands from manifests and layout", () => {
    const f = analyzeCodebase(snap({ "pyproject.toml": '[tool.ruff]\n[project]\ndependencies=["fastapi","pytest"]', "app/main.py": "from fastapi import FastAPI", "tests/test_main.py": "def test_x(): pass" }, ["app/a.py", "app/b.py", "app/c.py"]));
    assert.equal(f.commands.test, "pytest");
    assert.equal(f.commands.lint, "ruff check .");
    assert.ok(f.stacks.includes("fastapi"));
    assert.ok(f.stacks.includes("python"));
  });

  it("does not call a Node repo Python because of one stray script", () => {
    const f = analyzeCodebase(snap({ "package.json": PKG, "scripts/migrate.py": "print('x')" }));
    assert.ok(!f.stacks.includes("python"));
  });

  it("finds stacks from imports in sampled source, not just manifests", () => {
    const f = analyzeCodebase(snap({ "server.js": "const express = require('express')" }));
    assert.ok(f.stacks.includes("nodejs"));
  });

  it("flags committed env files but not examples, and never echoes secret values", () => {
    const secret = "AKIA" + "ABCDEFGHIJKLMNOP";
    const f = analyzeCodebase(snap({ ".env": "X=1", ".env.example": "X=", ".env.test": "X=1", "src/a.ts": `const k = "${secret}";` }));
    assert.deepEqual(f.security.committedEnvFiles, [".env"]);
    assert.equal(f.security.secretFindings.length, 1);
    assert.ok(!JSON.stringify(f.security).includes(secret));
  });

  it("detects auth tokens written to browser storage", () => {
    const f = analyzeCodebase(snap({ "src/auth.ts": "localStorage.setItem('access_token', t)" }));
    assert.equal(f.security.tokenStorageFindings.length, 1);
  });

  it("detects exposed production source maps", () => {
    const f = analyzeCodebase(snap({ "next.config.ts": "export default { productionBrowserSourceMaps: true }" }));
    assert.equal(f.security.sourceMapsEnabled, true);
  });

  it("reads Makefile targets as a fallback", () => {
    const f = analyzeCodebase(snap({ Makefile: "test:\n\tgo test\nlint:\n\tvet\n" }));
    assert.equal(f.commands.test, "make test");
  });
});

describe("scoring", () => {
  it("scores a bare repo low with concrete next steps", () => {
    const r = scoreSnapshot(snap({ "main.py": "print('hi')" }));
    assert.ok(r.total < 40, `expected < 40, got ${r.total}`);
    assert.equal(r.label, "Not ready");
    assert.ok(r.nextSteps.length > 0 && r.nextSteps.every((s) => s.fix));
    assert.ok(r.nextSteps[0].max - r.nextSteps[0].points >= r.nextSteps[r.nextSteps.length - 1].max - r.nextSteps[r.nextSteps.length - 1].points);
  });

  it("category maxima add up to exactly 100 and totals never exceed it", () => {
    const r = scoreSnapshot(goodRepo());
    assert.equal(r.categories.reduce((s, c) => s + c.max, 0), 100);
    assert.ok(r.total >= 0 && r.total <= 100);
    for (const c of r.checks) assert.ok(c.points >= 0 && c.points <= c.max, c.id);
  });

  it("a healthy repo without agent files still loses the instruction points", () => {
    const r = scoreSnapshot(goodRepo());
    const cat = r.categories.find((c) => c.id === "instructions")!;
    assert.equal(cat.points, 0);
    assert.ok(r.total >= 50 && r.total < 85, `got ${r.total}`);
  });

  it("DOGFOOD: adding an Agent Hub bundle lifts the score and earns the instruction points", () => {
    const base = goodRepo();
    const before = scoreSnapshot(base);
    const facts = analyzeCodebase(base);
    const files = buildBundle(["nextjs", "typescript", "react"], ["github-copilot", "claude-code", "cursor"], "combined", { knowledgeSeed: buildKnowledgeSeed(facts) });
    const merged = { ...base, paths: [...base.paths], files: { ...base.files } };
    for (const f of files) {
      if (!merged.paths.includes(f.path)) merged.paths.push(f.path);
      merged.files[f.path] = f.content;
    }
    const after = scoreSnapshot(merged);
    assert.ok(after.total > before.total + 20, `before ${before.total} after ${after.total}`);
    const inst = after.categories.find((c) => c.id === "instructions")!;
    assert.equal(inst.points, inst.max, JSON.stringify(after.checks.filter((c) => c.category === "instructions" && !c.ok).map((c) => c.id)));
    assert.equal(after.facts.agent.generatedVersion, TEMPLATE_CONTENT_VERSION);
    const fresh = after.checks.find((c) => c.id === "fresh")!;
    assert.ok(fresh.ok);
    const tokens = after.checks.find((c) => c.id === "token-budget")!;
    assert.ok(tokens.points >= 3, `token budget points ${tokens.points}, tokens ${after.facts.agent.maxTokens}`);
    assert.ok(after.total >= 90, `expected >= 90 got ${after.total}`);
  });

  it("an outdated generated file is marked stale", () => {
    const s = goodRepo();
    s.paths.push("AGENTS.md");
    s.files["AGENTS.md"] = "# Rules\nNever force push. Run npm test.\n---\n_Generated by Agent Hub v1.0.0 (content), last content update 2026-01-01._";
    const r = scoreFacts(analyzeCodebase(s));
    const fresh = r.checks.find((c) => c.id === "fresh")!;
    assert.equal(fresh.ok, false);
    assert.equal(fresh.points, 2);
  });

  it("is deterministic", () => {
    assert.deepEqual(scoreSnapshot(goodRepo()).total, scoreSnapshot(goodRepo()).total);
  });
});

describe("file selection", () => {
  it("prioritises agent files, manifests and CI, and skips vendored dirs", () => {
    const paths = ["CLAUDE.md", "package.json", ".github/workflows/ci.yml", "node_modules/x/package.json", "src/a.ts", "src/b.test.ts", "dist/out.js"];
    const picked = selectFilesToRead(paths);
    assert.deepEqual(picked.slice(0, 3), ["CLAUDE.md", "package.json", ".github/workflows/ci.yml"]);
    assert.ok(picked.includes("src/a.ts"));
    assert.ok(!picked.includes("node_modules/x/package.json"));
    assert.ok(!picked.includes("src/b.test.ts"));
    assert.ok(!picked.includes("dist/out.js"));
  });

  it("never reads more than the cap", () => {
    const paths = Array.from({ length: 500 }, (_, i) => `src/m${i}/file${i}.ts`);
    assert.ok(selectFilesToRead(paths).length <= MAX_FILES_READ);
  });

  it("recognises agent files for every tool", () => {
    for (const p of [".cursor/rules/a.mdc", ".github/copilot-instructions.md", "AGENTS.md", ".claude/agents/x.md", ".windsurfrules"]) assert.ok(isAgentFile(p), p);
    assert.ok(!isAgentFile("README.md"));
  });
});

describe("knowledge seed", () => {
  it("pre-fills detected commands and the map, and falls back to the empty template", () => {
    const seed = buildKnowledgeSeed(analyzeCodebase(goodRepo()));
    assert.ok(seed.includes("`npm test`"));
    assert.ok(seed.includes("`src/`"));
    assert.ok(seed.includes("## Pitfalls"));
    assert.ok(seed.split("\n").length < 60);
    assert.ok(buildKnowledgeSeed(null).includes("## Commands"));
  });
});

describe("detection accuracy (found by scoring real repos)", () => {
  it("does not read a Go module out of a Python pyproject", () => {
    const f = analyzeCodebase(snap({ "pyproject.toml": '[project]\nname="x"\n[tool.something]\nmodule = "pkg.main"\nrequires-python = ">=3.9" # go 1.21 mentioned in a comment' }));
    assert.ok(!f.stacks.includes("go"));
    const g = analyzeCodebase(snap({ "go.mod": "module example.com/app\n\ngo 1.22\n" }));
    assert.ok(g.stacks.includes("go"));
  });

  it("treats a bare package.json as Node, but leaves framework repos alone", () => {
    assert.ok(analyzeCodebase(snap({ "package.json": '{"name":"lib"}' })).stacks.includes("nodejs"));
    const next = analyzeCodebase(snap({ "package.json": PKG }));
    assert.ok(next.stacks.includes("nextjs") && !next.stacks.includes("nodejs"));
  });

  it("does not count env files inside test fixtures as committed secrets", () => {
    assert.deepEqual(analyzeCodebase(snap({ "tests/test_apps/.env": "A=1", "examples/app/.env": "A=1" })).security.committedEnvFiles, []);
    assert.deepEqual(analyzeCodebase(snap({ "backend/.env.production": "A=1" })).security.committedEnvFiles, ["backend/.env.production"]);
  });
});

describe("file selection budgets (found by scoring real monorepos)", () => {
  it("still samples source when a repo has dozens of agent files and manifests", () => {
    const paths = [
      ...Array.from({ length: 60 }, (_, i) => `.github/instructions/rule${i}.instructions.md`),
      ...Array.from({ length: 80 }, (_, i) => `packages/p${i}/package.json`),
      ...Array.from({ length: 200 }, (_, i) => `src/m${i}/file${i}.ts`),
    ];
    const picked = selectFilesToRead(paths);
    assert.ok(picked.length <= MAX_FILES_READ);
    assert.ok(picked.filter((p) => p.endsWith(".ts")).length >= 10, "source sample must survive the cap");
  });

  it("samples deeply nested Java-style source trees", () => {
    const deep = "src/main/java/org/example/app/service/impl/OrderService.java";
    assert.ok(selectFilesToRead([deep, "pom.xml"]).includes(deep));
  });

  it("reads canonical instruction files before the long tail", () => {
    const paths = [...Array.from({ length: 40 }, (_, i) => `.github/instructions/a${i}.instructions.md`), "AGENTS.md", "CLAUDE.md"];
    assert.deepEqual(selectFilesToRead(paths).slice(0, 2), ["AGENTS.md", "CLAUDE.md"]);
  });
});
