import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, before, after } from "node:test";
import { run } from "../cli/main";

function capture() {
  let out = "";
  let err = "";
  return { io: { out: (s: string) => (out += s), err: (s: string) => (err += s), color: false }, get out() { return out; }, get err() { return err; } };
}

let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), "ah-cli-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest run", lint: "eslint .", build: "next build" }, dependencies: { next: "16", react: "19" } }));
  writeFileSync(join(dir, "package-lock.json"), "{}");
  writeFileSync(join(dir, ".gitignore"), "node_modules\n.env\n");
  writeFileSync(join(dir, "README.md"), "# x");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.ts"), "export const a = 1");
  writeFileSync(join(dir, "src", "a.test.ts"), "// test");
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe("cli score", () => {
  it("prints a report and honours --min as an exit code", () => {
    const c = capture();
    assert.equal(run(["score", dir], c.io), 0);
    assert.match(c.out, /Agent-Readiness Score/);
    const gate = capture();
    assert.equal(run(["score", dir, "--min", "99"], gate.io), 1);
    assert.match(gate.err, /below the required minimum/);
  });

  it("emits valid JSON with --json", () => {
    const c = capture();
    assert.equal(run(["score", dir, "--json"], c.io), 0);
    const parsed = JSON.parse(c.out);
    assert.equal(typeof parsed.total, "number");
    assert.ok(Array.isArray(parsed.checks));
  });

  it("rejects bad input with exit code 2", () => {
    for (const argv of [["score", join(dir, "nope")], ["score", dir, "--min", "abc"], ["score", dir, "--wat"], ["score", dir, "--min"], ["bogus"]]) {
      const c = capture();
      assert.equal(run(argv, c.io), 2, argv.join(" "));
    }
  });
});

describe("cli init", () => {
  it("--dry-run writes nothing", () => {
    const c = capture();
    assert.equal(run(["init", dir, "--dry-run"], c.io), 0);
    assert.ok(!existsSync(join(dir, "CLAUDE.md")));
    assert.match(c.out, /would write/);
  });

  it("writes the bundle, pre-fills the knowledge base, and lifts the score", () => {
    const c = capture();
    assert.equal(run(["init", dir], c.io), 0);
    assert.ok(existsSync(join(dir, "CLAUDE.md")));
    assert.ok(existsSync(join(dir, ".agent.md")));
    const k = readFileSync(join(dir, ".agent", "knowledge.md"), "utf-8");
    assert.match(k, /`npm test`/);
    const m = /Score: (\d+) → (\d+)/.exec(c.out)!;
    assert.ok(Number(m[2]) > Number(m[1]) + 20, c.out);
    const s = capture();
    assert.equal(run(["score", dir, "--min", "80"], s.io), 0, s.out);
  });

  it("never overwrites existing files without --force, and never the knowledge base even with it", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "hand-written rules");
    writeFileSync(join(dir, ".agent", "knowledge.md"), "agent learned things");
    const c = capture();
    assert.equal(run(["init", dir], c.io), 0);
    assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf-8"), "hand-written rules");
    assert.equal(run(["init", dir, "--force"], capture().io), 0);
    assert.notEqual(readFileSync(join(dir, "CLAUDE.md"), "utf-8"), "hand-written rules");
    assert.equal(readFileSync(join(dir, ".agent", "knowledge.md"), "utf-8"), "agent learned things");
  });

  it("validates stack, target and mode names", () => {
    for (const argv of [["init", dir, "--stacks", "cobol"], ["init", dir, "--targets", "emacs"], ["init", dir, "--mode", "wild"]]) {
      const c = capture();
      assert.equal(run(argv, c.io), 2, argv.join(" "));
    }
  });

  it("does not follow symlinks out of the project", () => {
    const outside = mkdtempSync(join(tmpdir(), "ah-outside-"));
    writeFileSync(join(outside, "AGENTS.md"), "SECRET OUTSIDE CONTENT");
    const d2 = mkdtempSync(join(tmpdir(), "ah-sym-"));
    symlinkSync(join(outside, "AGENTS.md"), join(d2, "AGENTS.md"));
    const c = capture();
    run(["score", d2, "--json"], c.io);
    assert.ok(!c.out.includes("SECRET OUTSIDE"));
    assert.ok(!JSON.parse(c.out).agentFiles.includes("AGENTS.md"));
    rmSync(outside, { recursive: true, force: true });
    rmSync(d2, { recursive: true, force: true });
  });
});
