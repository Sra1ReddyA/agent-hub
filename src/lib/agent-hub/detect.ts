import type { StackId } from "./stacks";

/**
 * Auto-detects which stacks apply to a real repository by scanning manifest files the user pastes or
 * uploads — `package.json`, `requirements.txt`/`pyproject.toml`, `go.mod`, `Cargo.toml`, a Gemfile, a
 * `.csproj`, `pubspec.yaml`, Terraform files, docker-compose, etc. This is what separates Agent Hub from a
 * static picker: instead of a human reading their own dependency list and manually checking boxes, Agent
 * Hub reads the actual source of truth and pre-selects the exact combination — including catching a stack
 * the person forgot they had transitively (e.g. Prisma pulled in as an ORM under a Node/Express backend).
 *
 * Deliberately dependency-free and heuristic, not a real parser: this only needs to notice that a token is
 * present somewhere in the pasted text, not validate the manifest's structure. False positives are rare
 * because the search strings are specific package/import names, not generic words.
 */

type Rule = { id: StackId; patterns: RegExp[] };

const RULES: Rule[] = [
  { id: "python", patterns: [/\bpython_requires\b/i, /\.py['"]?\s*:/i, /\brequirements\.txt\b/i, /^python$/im] },
  { id: "java", patterns: [/<groupId>/i, /\bjava\.version\b/i, /\.java['"]?\s*:/i] },
  { id: "fastapi", patterns: [/\bfastapi\b/i, /from fastapi import/i] },
  { id: "react", patterns: [/"react"\s*:/i, /\breact-dom\b/i] },
  { id: "nextjs", patterns: [/"next"\s*:/i, /next\.config\.(js|ts|mjs)/i] },
  { id: "nodejs", patterns: [/"express"\s*:/i, /"koa"\s*:/i, /"fastify"\s*:/i, /\bnode_modules\b/i] },
  { id: "spring-boot", patterns: [/spring-boot-starter/i, /org\.springframework\.boot/i] },
  { id: "go", patterns: [/^module\s+\S+/im, /\bgo\s+1\.\d+/i, /"github\.com\/.*\/go-/i] },
  { id: "rust", patterns: [/\[package\]/i, /\[dependencies\]/i, /^edition\s*=\s*"20\d\d"/im] },
  { id: "vue", patterns: [/"vue"\s*:/i, /<script setup/i] },
  { id: "angular", patterns: [/"@angular\/core"\s*:/i] },
  { id: "docker-k8s", patterns: [/^FROM\s+\S+/im, /apiVersion:\s*apps\/v1/i, /kind:\s*Deployment/i] },
  { id: "sql-prisma", patterns: [/"prisma"\s*:/i, /"@prisma\/client"\s*:/i, /^datasource\s+db/im] },
  { id: "typescript", patterns: [/"typescript"\s*:/i, /"tsc"\s*:/i, /tsconfig\.json/i] },
  { id: "django", patterns: [/\bdjango\b/i, /from django/i] },
  { id: "rails", patterns: [/gem ["']rails["']/i, /Gemfile/i] },
  { id: "dotnet", patterns: [/<TargetFramework>/i, /\.csproj/i, /Microsoft\.AspNetCore/i] },
  { id: "flutter", patterns: [/\bflutter\b/i, /pubspec\.yaml/i] },
  { id: "terraform", patterns: [/^resource\s+"/im, /^provider\s+"/im, /\.tf['"]?\s*:/i] },
  { id: "postgresql", patterns: [/\bpostgres(ql)?\b/i, /"pg"\s*:/i, /psycopg2/i] },
  { id: "mongodb", patterns: [/\bmongodb\b/i, /"mongoose"\s*:/i, /pymongo/i] },
  { id: "tailwind", patterns: [/"tailwindcss"\s*:/i, /tailwind\.config\.(js|ts|mjs)/i] },
];

/** Scans one blob of pasted manifest text and returns every stack id whose signature pattern matched.
 * Order follows `RULES` (roughly languages → backends → frontends → data → tools), not insertion order of
 * matches, so results are stable and easy to read back to the person before they commit to the selection. */
export function detectStacksFromManifest(text: string): StackId[] {
  if (!text.trim()) return [];
  const found: StackId[] = [];
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) found.push(rule.id);
  }
  return found;
}
