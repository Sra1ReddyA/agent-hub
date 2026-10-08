/**
 * Decides which files of a repository are worth reading. A scan has to stay cheap (a handful of HTTP
 * requests for a public repo, a bounded amount of work for the CLI), so instead of crawling everything it
 * reads: the agent-instruction files, the build/dependency manifests and a few config files, CI workflow
 * files, and a small, evenly-spread sample of source files (for the secret / unsafe-storage heuristics).
 * Shared by every snapshot builder so the CLI, the website and Sync all score a repo identically.
 */

export const MAX_FILES_READ = 56;
export const MAX_FILE_CHARS = 60_000;
// Each kind of file gets its own budget, so a repo with hundreds of manifests or dozens of agent files (big
// monorepos) can't crowd out the source sample the security heuristics depend on.
const CAP_AGENT = 18;
const CAP_MANIFEST = 18;
const CAP_CI = 4;
const SOURCE_SAMPLE_SIZE = 14;

export const IGNORED_DIR = /(^|\/)(node_modules|vendor|dist|build|out|\.next|\.git|target|__pycache__|\.venv|venv|env|coverage|\.turbo|\.cache|third_party|Pods|\.gradle|bin|obj)(\/|$)/;

const depth = (p: string) => p.split("/").length - 1;
export const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

// ---------- agent instruction files ----------

const AGENT_EXACT = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  ".agent.md",
  ".cursorrules",
  ".windsurfrules",
  ".clinerules",
  ".github/copilot-instructions.md",
  "CONVENTIONS.md",
  "GEMINI.md",
]);
const AGENT_PREFIXES = [".cursor/rules/", ".github/instructions/", ".github/agents/", ".claude/agents/", ".claude/rules/", ".continue/rules/", ".clinerules/", ".windsurf/rules/"];
export const KNOWLEDGE_FILE = ".agent/knowledge.md";

export function isAgentFile(path: string): boolean {
  if (AGENT_EXACT.has(path)) return true;
  return AGENT_PREFIXES.some((pre) => path.startsWith(pre) && /\.(md|mdc|txt)$/i.test(path));
}

/** Which AI coding tools a set of paths covers (distinct, stable order). */
export function toolsCovered(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (p === "CLAUDE.md" || p.startsWith(".claude/")) out.add("Claude Code");
    else if (p === ".cursorrules" || p.startsWith(".cursor/rules/")) out.add("Cursor");
    else if (p === ".github/copilot-instructions.md" || p.startsWith(".github/instructions/") || p.startsWith(".github/agents/")) out.add("GitHub Copilot");
    else if (p === ".windsurfrules" || p.startsWith(".windsurf/rules/")) out.add("Windsurf");
    else if (p === ".clinerules" || p.startsWith(".clinerules/")) out.add("Cline");
    else if (p.startsWith(".continue/rules/")) out.add("Continue");
    else if (p === "CONVENTIONS.md" || p === ".aider.conf.yml") out.add("Aider");
    else if (p === "AGENTS.md" || p === ".agent.md" || p === "GEMINI.md") out.add("AGENTS.md / generic");
  }
  return [...out];
}

// ---------- manifests and config ----------

export const MANIFEST_BASENAMES = new Set([
  "package.json",
  "pyproject.toml",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "pubspec.yaml",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
  "composer.json",
]);
export const isManifest = (p: string) => (MANIFEST_BASENAMES.has(basename(p)) || /^requirements.*\.txt$/.test(basename(p)) || p.endsWith(".csproj")) && depth(p) <= 2;

const ROOT_CONFIG = new Set([
  "tsconfig.json",
  ".gitignore",
  ".env.example",
  ".env.sample",
  ".env.template",
  "Makefile",
  "pytest.ini",
  "setup.cfg",
  "tox.ini",
  ".prettierrc",
  ".eslintrc",
  ".eslintrc.json",
  "vercel.json",
]);
const isConfig = (p: string) => depth(p) === 0 && (ROOT_CONFIG.has(p) || /^(next|vite|webpack|nuxt|svelte|astro)\.config\.[cm]?[jt]s$/.test(p));

// ---------- CI ----------

const CI_ROOT = new Set([".gitlab-ci.yml", ".circleci/config.yml", "azure-pipelines.yml", "Jenkinsfile", "bitbucket-pipelines.yml"]);
export const isCiFile = (p: string) => CI_ROOT.has(p) || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p);

// ---------- tests & source ----------

const TEST_PATH = /(^|\/)(__tests__|tests?|spec|specs|e2e|cypress)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rb)$|(^|\/)test_[^/]+\.py$|Tests?\.(java|kt|cs)$|_spec\.rb$/;
export const isTestPath = (p: string) => TEST_PATH.test(p);

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|py|go|java|kt|rb|cs|php|rs|dart|vue|svelte)$/;
export function isSampleableSource(p: string): boolean {
  return SOURCE_EXT.test(p) && !IGNORED_DIR.test(p) && !isTestPath(p) && !/\.min\.|\.d\.ts$|(^|\/)generated\/|\.generated\./.test(p) && depth(p) <= 10;
}

/** Picks up to `MAX_FILES_READ` paths to read, in priority order: agent files, manifests/config, CI, then
 * an evenly spread, deterministic sample of source files. */
export function selectFilesToRead(allPaths: string[]): string[] {
  const paths = allPaths.filter((p) => !IGNORED_DIR.test(p));
  // Canonical, top-level instruction files first; the long tail (per-directory rules, sub-agents) after.
  const canonical = (p: string) => (AGENT_EXACT.has(p) ? 0 : 1);
  const agent = paths
    .filter(isAgentFile)
    .sort((a, b) => canonical(a) - canonical(b) || a.localeCompare(b))
    .slice(0, CAP_AGENT);
  if (paths.includes(KNOWLEDGE_FILE)) agent.push(KNOWLEDGE_FILE);
  const manifests = paths
    .filter((p) => isManifest(p) || isConfig(p))
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
    .slice(0, CAP_MANIFEST);
  const ci = paths.filter(isCiFile).sort().slice(0, CAP_CI);

  const candidates = paths.filter(isSampleableSource).sort();
  const sample: string[] = [];
  if (candidates.length <= SOURCE_SAMPLE_SIZE) sample.push(...candidates);
  else {
    const step = candidates.length / SOURCE_SAMPLE_SIZE;
    for (let i = 0; i < SOURCE_SAMPLE_SIZE; i++) sample.push(candidates[Math.floor(i * step)]);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...agent, ...manifests, ...ci, ...sample]) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= MAX_FILES_READ) break;
  }
  return out;
}

/** Rough token estimate (~4 characters per token) — the same rule of thumb every provider documents. Used to
 * tell people how much context their agent instructions burn on every single request. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
