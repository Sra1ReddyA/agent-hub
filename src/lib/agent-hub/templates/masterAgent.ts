import type { Stack, StackId, StackRole } from "../stacks";
import { getCrossStackGuardrails } from "../cross-stack";
import {
  END_OF_SESSION_REPORTING_MD,
  GIT_WORKFLOW_MD,
  OPERATIONAL_GUARDRAILS_MD,
  SELF_VERIFICATION_LOOP_MD,
  UNIVERSAL_GUARDRAILS_MD,
} from "./universalGuardrails";

/**
 * Builds the Master Agent Markdown body — for one stack (`buildMasterAgent`) or for a whole selected
 * stack combination merged into one unified document (`buildCombinedMasterAgent`). Both share the same
 * fixed 10-point Operating Directive set, the same Universal Guardrails, the same Operational Guardrails &
 * Safety Boundaries (Always allowed / Ask first / Never allowed), the same Verification Workflow (a
 * self-verification loop plus each selected stack's real lint/type-check/test/build commands), the same
 * Git & Pull Request Conventions, and the same mandatory end-of-session reporting rule — filled in with
 * per-stack idioms, type-safety patterns, performance concerns, file globs and anti-patterns, so "what good
 * code looks like" for a stack is defined in exactly one place (`stacks.ts` + this file) no matter how many
 * tools or how many other stacks it's combined with.
 */

/** Directive #2's stack-specific type-safety pattern — the one line most stacks differ on most. */
const TYPE_SAFETY: Record<StackId, string> = {
  python: "Full `typing` coverage on every public signature; run `mypy --strict` in CI. Use `dataclasses`/`pydantic` models instead of untyped dicts at any boundary.",
  java: "Java 21 record types for immutable data, sealed interfaces for closed hierarchies, `Optional<T>` instead of nullable returns on public APIs.",
  fastapi: "Pydantic v2 (`BaseModel`, `model_validate`, `model_dump`, `ConfigDict`) for every request/response body — never a raw `dict` payload, never v1 (`.dict()`/`.parse_obj()`) syntax.",
  react: "Strict TypeScript: typed props/state, no implicit `any`, discriminated unions for variant UI state instead of loose boolean flags.",
  nextjs: "Strict TypeScript end to end — typed Route Handler bodies (zod-validated), typed Server Action arguments, typed `params`/`searchParams`.",
  nodejs: "Strict TypeScript (or JSDoc + `checkJs` in a JS codebase) on every module boundary; validate all external input with a schema library (zod/joi) before it touches business logic.",
  "spring-boot": "Java 21 records for DTOs, `@Valid`/Bean Validation annotations on every controller input, `Optional<T>` over nullable return types.",
  go: "Explicit, narrow struct types and small consumer-defined interfaces; no `interface{}`/`any` where a concrete type is knowable.",
  rust: "Lean on the type system: enums for domain state instead of booleans/strings, `Result<T, E>` for fallibility, newtypes for values that shouldn't be interchangeable with a raw primitive.",
  vue: "`defineProps<T>()` / `defineEmits<T>()` with explicit TypeScript types in every `<script setup>` component — no implicit prop typing.",
  angular: "Typed reactive forms (`FormGroup<{...}>`), strict TypeScript, typed `@Input()`/`@Output()` — never `any` on a component boundary.",
  "docker-k8s": "Schema-validated manifests (`kubectl --dry-run=server` / a CI schema check) and typed values files for Helm — no untyped free-form YAML for anything deployed.",
  "sql-prisma": "Prisma's generated types end to end — never hand-cast a raw query result; keep `schema.prisma` as the single source of truth for shapes used elsewhere in the app.",
  typescript: "`strict: true` end to end, `unknown` + narrowing instead of `any`, discriminated unions for variant state, and runtime schema validation (zod/valibot) at every real I/O boundary.",
  django: "Django model fields and DRF serializers as the source of truth for shape and validation — no hand-built `dict()` payloads standing in for a serializer.",
  rails: "Strong parameters and ActiveRecord validations at every mass-assignment and model boundary — never `params.permit!`, never an unvalidated attribute write.",
  dotnet: "Nullable reference types enabled project-wide, `record` types for request/response contracts, data annotations or FluentValidation at the API boundary.",
  flutter: "Dart's sound null-safety used fully — no `!` null-assertions without a commented guarantee — and explicit, typed models instead of passing raw `Map<String, dynamic>` through the widget tree.",
  terraform: "Explicit `variable`/`output` contracts on every module, `sensitive = true` on anything secret, and pinned provider/module version constraints — no untyped, unconstrained inputs.",
  postgresql: "Explicit column types and constraints (`NOT NULL`, `CHECK`, foreign keys) doing validation work at the database layer, not left entirely to the application.",
  mongodb: "Application-layer schema validation (Pydantic/Mongoose/Zod) on every write path — MongoDB's own flexibility is not a substitute for a validated document shape.",
  tailwind: "Design tokens defined in the theme config and referenced by name — no untyped magic numbers or ad-hoc arbitrary values standing in for a real scale.",
};

/** Directive #7's stack-specific performance/resource-management concern. */
const PERF: Record<StackId, string> = {
  python: "Watch for O(n²) list operations on large inputs, unbounded in-memory buffering of large files, and blocking I/O on a path that should be async.",
  java: "Watch for N+1 JPA/Hibernate queries, unbounded collection growth, and unnecessary object allocation inside hot loops.",
  fastapi: "Never block the event loop inside `async def` (blocking DB drivers, `requests`, CPU-bound work) — use `run_in_threadpool` or an async driver instead.",
  react: "Profile before memoizing; watch for unnecessary re-renders from inline object/array literals as props and unbatched state updates in hot paths.",
  nextjs: "Be explicit about `fetch` caching/`revalidate`, use `next/image`/`next/font`, and keep Server Components as the default so client JS stays minimal.",
  nodejs: "Never block the event loop with synchronous CPU-heavy work; use streams for large payloads instead of buffering entire files/responses in memory.",
  "spring-boot": "Watch for N+1 queries (`@EntityGraph`/fetch joins), unbounded `@Transactional` scopes, and unnecessary eager fetching.",
  go: "Watch for goroutine leaks (no owner/cancellation path), unnecessary allocations in hot paths, and unbuffered channels causing avoidable blocking.",
  rust: "Prefer borrowing over unnecessary `.clone()`, watch for allocation-heavy patterns in hot loops, and use `cargo bench`/profiling before hand-optimizing.",
  vue: "Keep reactive state minimal, use `v-memo`/`shallowRef` for large lists, and avoid deep-watching large objects unnecessarily.",
  angular: "Default to `OnPush` change detection, avoid heavy computation in templates, and always tear down subscriptions to prevent leaks.",
  "docker-k8s": "Set resource `requests`/`limits` on every container, keep images minimal (multi-stage builds), and configure liveness/readiness probes distinctly.",
  "sql-prisma": "Index every column driving a frequent `WHERE`/`ORDER BY`/join; batch queries with `include`/`select` instead of N+1 per-row calls in a loop.",
  typescript: "Avoid unnecessary object/array allocation in hot loops, prefer `Map`/`Set` over linear array scans for lookups, and let the type system catch shape mistakes at compile time rather than at runtime.",
  django: "Watch for N+1 queries from unprefetched related-object access, use `.only()`/`.values()` to avoid over-fetching columns, and cache expensive, rarely-changing queries deliberately.",
  rails: "Watch for N+1 queries from un-eager-loaded associations, use `pluck`/`select` to avoid loading full records when only a few columns are needed, and background slow work with Active Job instead of blocking a request.",
  dotnet: "Never block on async with `.Result`/`.Wait()`, watch for EF Core N+1 queries from lazy loading, and use `AsNoTracking()` for read-only queries.",
  flutter: "Mark widgets `const` wherever possible, avoid rebuilding large widget subtrees for small state changes (scope state with `Consumer`/`Selector`/`BlocBuilder`), and dispose controllers/subscriptions promptly.",
  terraform: "Keep modules small and composable to keep `plan`/`apply` fast, avoid `count`/`for_each` over large unbounded lists without pagination, and use `-target` sparingly rather than as a routine workflow.",
  postgresql: "Index every column driving a frequent filter/join/sort and verify with `EXPLAIN ANALYZE`; watch for lock contention from long-running transactions.",
  mongodb: "Index every field driving a frequent query and verify with `explain()`; watch for unbounded `find()` results with no pagination and oversized documents approaching the 16MB limit.",
  tailwind: "Keep the `content` glob accurate so the production build purges unused utilities without dropping ones that are actually used.",
};

type VerifyCommands = { lint?: string; typecheck?: string; test?: string; build?: string };

/** The actual lint/format, type-check, test, and build commands for each stack's own ecosystem — fed into
 * the "Verification Workflow" section so the self-verification loop (see `SELF_VERIFICATION_LOOP_MD`) has
 * real commands to run instead of a generic "run your tests" placeholder. A stack with no meaningful
 * command for a column (e.g. a database has no "build" step) simply omits that key — the table renders
 * "—" for it. */
const VERIFY_COMMANDS: Record<StackId, VerifyCommands> = {
  python: { lint: "ruff check . --fix && ruff format .", typecheck: "mypy .", test: "pytest -v" },
  java: { lint: "mvn checkstyle:check", test: "mvn test", build: "mvn package" },
  fastapi: { lint: "ruff check . --fix && ruff format .", typecheck: "mypy app/", test: "pytest tests/ -v" },
  react: { lint: "npm run lint", typecheck: "tsc --noEmit", test: "npm run test", build: "npm run build" },
  nextjs: { lint: "next lint", typecheck: "tsc --noEmit", test: "npm run test", build: "npm run build" },
  nodejs: { lint: "npm run lint", typecheck: "tsc --noEmit", test: "npm test", build: "npm run build" },
  "spring-boot": { lint: "./gradlew checkstyleMain", test: "./gradlew test", build: "./gradlew build" },
  go: { lint: "golangci-lint run", typecheck: "go vet ./...", test: "go test ./...", build: "go build ./..." },
  rust: { lint: "cargo clippy --all-targets -- -D warnings", typecheck: "cargo check", test: "cargo test", build: "cargo build --release" },
  vue: { lint: "npm run lint", typecheck: "vue-tsc --noEmit", test: "npm run test:unit", build: "npm run build" },
  angular: { lint: "ng lint", typecheck: "tsc --noEmit", test: "ng test", build: "ng build" },
  "docker-k8s": { lint: "hadolint Dockerfile && kubectl apply --dry-run=server -f .", build: "docker build ." },
  "sql-prisma": { lint: "npx prisma validate", build: "npx prisma generate" },
  typescript: { lint: "eslint .", typecheck: "tsc --noEmit", test: "npm test", build: "npm run build" },
  django: { lint: "ruff check . --fix", test: "python manage.py test" },
  rails: { lint: "rubocop", test: "bundle exec rspec" },
  dotnet: { lint: "dotnet format --verify-no-changes", test: "dotnet test", build: "dotnet build" },
  flutter: { lint: "flutter analyze", test: "flutter test", build: "flutter build apk" },
  terraform: { lint: "terraform fmt -check && tflint", typecheck: "terraform validate", build: "terraform plan" },
  postgresql: { lint: "EXPLAIN ANALYZE on any changed query" },
  mongodb: { lint: "db.collection.explain() on any changed query" },
  tailwind: { build: "npm run build (verify the content glob still purges correctly)" },
};

function renderVerifyTable(stacks: Stack[]): string {
  const cell = (v?: string) => (v ? `\`${v}\`` : "—");
  const rows = stacks
    .map((s) => {
      const c = VERIFY_COMMANDS[s.id];
      return `| ${s.label} | ${cell(c.lint)} | ${cell(c.typecheck)} | ${cell(c.test)} | ${cell(c.build)} |`;
    })
    .join("\n");
  return `| Stack | Lint / Format | Type Check | Tests | Build |
| :--- | :--- | :--- | :--- | :--- |
${rows}`;
}

/** The full "Verification Workflow" section for one or more stacks: the fixed self-verification loop text
 * plus a command table naming the real lint/type-check/test/build commands for whichever stack(s) this
 * document covers. Appears once per document — in `buildMasterAgent` for a single stack, and once (across
 * every selected stack) in `buildCombinedMasterAgent` — never once per stack inside a combined document. */
function buildVerificationSection(stacks: Stack[]): string {
  return `## Verification Workflow
${SELF_VERIFICATION_LOOP_MD}

${renderVerifyTable(stacks)}`;
}

/** A directive body can be written generically (no stack input needed), per-single-stack, or per a whole
 * list of stacks (used for directives #2 and #7, which are the two that actually vary by stack). */
type DirectiveBody = (stacks: Stack[]) => string;

/** Renders a per-stack lookup (TYPE_SAFETY or PERF) as a single inline sentence for one stack, or as a
 * bulleted per-stack list when multiple stacks are combined — avoids a wall of "for stack X: ... for stack
 * Y: ..." prose once three or four stacks are selected at once. */
function perStackLines(stacks: Stack[], table: Record<StackId, string>): string {
  if (stacks.length === 1) return table[stacks[0].id];
  return stacks.map((s) => `- **${s.label}**: ${table[s.id]}`).join("\n");
}

const TEN_DIRECTIVES: { title: string; body: DirectiveBody }[] = [
  {
    title: "Zero Hallucination & Codebase Verification",
    body: () =>
      `Before writing or changing any code, read the actual files involved and inspect real dependency versions (\`package.json\`/\`pyproject.toml\`/\`pom.xml\`/\`go.mod\`/\`Cargo.toml\` — whichever this repo uses). Never invent a package, API, import, or config option that isn't actually present. If a needed capability doesn't exist yet in the codebase, say so explicitly rather than assuming it and writing code against it.`,
  },
  {
    title: "Strict Type Safety & Schemas",
    body: (stacks) => perStackLines(stacks, TYPE_SAFETY),
  },
  {
    title: "Bug Prevention & Defensive Logic",
    body: () =>
      `Never introduce a regression. Before changing existing behavior, understand what currently depends on it. Validate edge cases explicitly: empty input, null/undefined/None, zero, negative numbers, boundary values (min/max), and unexpected types at every boundary that accepts external or user-controlled data.`,
  },
  {
    title: "Token Efficiency",
    body: () =>
      `Reply with the minimal diff that correctly solves the task — never a full-file reprint of unchanged code, never a narrated line-by-line walkthrough. Don't repeat code back "for context"; reference it by name/line. Don't add speculative abstractions, unrelated refactors, or unrequested new dependencies in the same change.`,
  },
  {
    title: "Comprehensive Unit Testing",
    body: () =>
      `Every new or materially changed function/endpoint/component gets a test covering its happy path, its realistic edge cases, and at least one failure mode — using whatever test framework this repo already has configured. Mock external dependencies (network, filesystem, database, clock) rather than hitting them for real, unless the suite is explicitly an integration suite. Never delete or weaken an existing test to make a change pass; add a regression test for every bug fix.`,
  },
  {
    title: "OWASP & Security Standards",
    body: () =>
      `Treat every request body, query param, header, file upload, and environment variable as untrusted until validated. Prevent injection (SQL/NoSQL/command/template), XSS, insecure deserialization, and unsafe state mutation from shared/global data. Never hard-code, log, or commit a secret, API key, token, or credential — read them from environment/secret storage only. Reject overly permissive defaults (open CORS, disabled TLS verification, verbose error responses that leak internals).`,
  },
  {
    title: "Performance & Resource Management",
    body: (stacks) => perStackLines(stacks, PERF),
  },
  {
    title: "Architectural Consistency",
    body: () =>
      `Match the folder structure, naming conventions, and design patterns already established in this workspace before introducing a new one. When two conventions already coexist in the repo, follow whichever the immediately surrounding code uses, and flag the inconsistency instead of silently picking a third way.`,
  },
  {
    title: "Error Handling & Logging",
    body: () =>
      `Every operation that can fail gets explicit, structured error handling — no silently swallowed exceptions, no bare catch-and-ignore. Error messages must be actionable (what failed, likely cause, what to check) rather than generic. Log at the right level (don't log expected/handled conditions as errors; don't log secrets or PII) and prefer structured logging over ad-hoc string concatenation when the codebase already has a logging convention.`,
  },
  {
    title: "Automated Documentation & README Sync (MANDATORY POST-TASK RULE)",
    body: () =>
      `After completing ANY feature, API change, dependency change, or refactor, automatically inspect the project's root \`README.md\` and update it — new/changed endpoints, new environment variables, new dependencies, and any architectural adjustment the change introduces. This step is not optional and is not skipped for "small" changes that touch a public interface. If the repo has no README yet, create a minimal one covering what was just built rather than skipping the step. State explicitly in the response that the README was checked/updated (or that no update was needed, and why).`,
  },
];

function renderDirectives(stacks: Stack[]): string {
  return TEN_DIRECTIVES.map((d, i) => `### ${i + 1}. ${d.title}\n${d.body(stacks)}`).join("\n\n");
}

function primarySurface(fileGlobs: string[]) {
  return [...new Set(fileGlobs)].map((g) => `- \`${g}\``).join("\n");
}

const TOOL_LIST_SENTENCE =
  "GitHub Copilot, Claude Code, Cursor, Windsurf, Cline, Continue, Aider, or an agent that reads the emerging `AGENTS.md` convention";

/** Renders the person's own free-text team rules (one per line) as a Markdown section, or "" if empty.
 * This is what turns Agent Hub from a static template into a real per-organization tool: "always use our
 * internal Logger, never console.log" or "all new endpoints go through the ApiGateway service" are things
 * no generic best-practices file can know, so they're layered on top of — never a replacement for — the
 * stack-specific and universal content above. Appears exactly once per document, same as the other
 * one-time sections. */
function renderCustomRulesSection(customRules?: string): string {
  const lines = (customRules ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `## Team-Specific Directives
These are this team's own rules, layered on top of everything above — they take precedence over a
generic best practice above if the two ever conflict, since they encode something specific to how this
team actually works that no generic stack guidance could know.

${lines.map((l) => `- ${l}`).join("\n")}`;
}

/** Builds the full master-agent Markdown for ONE stack — used in single-stack selections and in
 * "Modular" multi-stack mode, where each selected stack gets its own independent file. Ends with the
 * Universal Guardrails and the mandatory end-of-session reporting rule, exactly once. */
export function buildMasterAgent(stack: Stack, customRules?: string): string {
  const customSection = renderCustomRulesSection(customRules);
  return `# ${stack.label} Master Agent

## Role
A single, consolidated AI coding agent for **${stack.label}** (${stack.tagline}) work in this repository.
This file is the one source of truth for how any AI coding assistant — ${TOOL_LIST_SENTENCE} — should read,
write and review ${stack.label} code here. Token discipline, test generation, security review and
${stack.label} idioms are not split across separate files; they are all enforced together, on every
change, by this agent.

## Primary surface
${primarySurface(stack.fileGlobs)}

## 10 Core Operating Directives
These apply to every change this agent makes or reviews in this repository, with no exceptions.

${renderDirectives([stack])}

## ${stack.label}-specific best practices
${stack.practices.map((p) => `- ${p}`).join("\n")}

## How this agent behaves
${stack.agentFocus.map((f) => `- ${f}`).join("\n")}

## Anti-patterns flagged on sight
${stack.antiPatterns.map((a) => `- ${a}`).join("\n")}

${customSection}

${UNIVERSAL_GUARDRAILS_MD}

${OPERATIONAL_GUARDRAILS_MD}

${buildVerificationSection([stack])}

${GIT_WORKFLOW_MD}

${END_OF_SESSION_REPORTING_MD}

## Working agreement
1. Verify against the real codebase before proposing a change (Directive 1).
2. Make the smallest correct change, typed and tested (Directives 2, 4, 5).
3. Review it against the security and performance directives before calling it done (Directives 6, 7).
4. Match this repo's existing conventions, not a generic "best practice" that conflicts with them (Directive 8).
5. Handle and log errors explicitly (Directive 9).
6. Update \`README.md\` to reflect what changed — every time, without being asked (Directive 10).
7. Run the Verification Workflow above before calling any change done.
8. Close every response with the Task Summary & Application Impact table above.
`;
}

const ROLE_SECTION_TITLE: Record<StackRole, string> = {
  frontend: "Frontend Rules",
  backend: "Backend Rules",
  database: "Database Rules",
  mobile: "Mobile Rules",
  tools: "Tools & Infra Rules",
};

const ROLE_ORDER: StackRole[] = ["frontend", "backend", "database", "mobile", "tools"];

function renderStackSection(stack: Stack): string {
  return `### ${stack.label}
**${stack.tagline}**

**Best practices**
${stack.practices.map((p) => `- ${p}`).join("\n")}

**How this agent behaves for ${stack.label}**
${stack.agentFocus.map((f) => `- ${f}`).join("\n")}

**Anti-patterns flagged on sight**
${stack.antiPatterns.map((a) => `- ${a}`).join("\n")}`;
}

function comboLabel(stacks: Stack[]): string {
  return stacks.map((s) => s.label).join(" + ");
}

function renderCrossStackSection(stacks: Stack[], label: string): string {
  const crossStack = getCrossStackGuardrails(stacks);
  if (crossStack.length === 0) return "";
  return `## Cross-Stack Guardrails
This combination is **${label}** — the guardrails below exist specifically because these stacks are
selected together; none of them apply to any one stack in isolation.

${crossStack.map((r) => `### ${r.title}\n${r.guidance.map((g) => `- ${g}`).join("\n")}`).join("\n\n")}`;
}

/** Builds ONE unified Master Agent document for an entire selected stack combination — "Combined" mode
 * (Option A). Cleanly delineates Frontend / Backend / Database / Mobile / Tools & Infra sections (only
 * the roles actually present), followed by Cross-Stack Guardrails for the specific combination selected,
 * with the 10 directives, Universal Guardrails and end-of-session reporting rule appearing exactly ONCE
 * for the whole document — never duplicated per stack. */
export function buildCombinedMasterAgent(stacks: Stack[], customRules?: string): string {
  if (stacks.length === 1) return buildMasterAgent(stacks[0], customRules);

  const label = comboLabel(stacks);
  const allGlobs = stacks.flatMap((s) => s.fileGlobs);

  const byRole = new Map<StackRole, Stack[]>();
  for (const s of stacks) byRole.set(s.role, [...(byRole.get(s.role) ?? []), s]);

  const roleSections = ROLE_ORDER.filter((r) => byRole.has(r))
    .map((role) => `## ${ROLE_SECTION_TITLE[role]}\n${byRole.get(role)!.map(renderStackSection).join("\n\n")}`)
    .join("\n\n");

  const crossStackSection = renderCrossStackSection(stacks, label);
  const customSection = renderCustomRulesSection(customRules);

  return `# Full-Stack Master Agent — ${label}

## Role
One consolidated AI coding agent governing the **entire selected stack** — ${label} — in this repository.
This file is the single source of truth for how any AI coding assistant — ${TOOL_LIST_SENTENCE} — should
read, write and review code anywhere in this repository, across every layer. It understands cross-stack
workflows: how a frontend change affects backend endpoints, how a backend model change affects the
database schema, and how a schema change propagates all the way back up to the UI. Nothing here is split
by layer into separate files that can drift out of sync with each other.

## Primary surface
${primarySurface(allGlobs)}

## 10 Core Operating Directives
These apply to every change this agent makes or reviews, in any part of this repository, with no exceptions.

${renderDirectives(stacks)}

${roleSections}

${crossStackSection}

${customSection}

${UNIVERSAL_GUARDRAILS_MD}

${OPERATIONAL_GUARDRAILS_MD}

${buildVerificationSection(stacks)}

${GIT_WORKFLOW_MD}

${END_OF_SESSION_REPORTING_MD}

## Working agreement
1. Verify against the real codebase before proposing a change (Directive 1).
2. Make the smallest correct change, typed and tested (Directives 2, 4, 5).
3. Review it against the security and performance directives before calling it done (Directives 6, 7).
4. Match this repo's existing conventions, not a generic "best practice" that conflicts with them (Directive 8).
5. Handle and log errors explicitly (Directive 9).
6. When a change crosses layers, follow it all the way through using the Cross-Stack Guardrails above — a
   database change is not done until the backend and frontend that depend on it are updated too.
7. Update \`README.md\` to reflect what changed — every time, without being asked (Directive 10).
8. Run the Verification Workflow above — for whichever stack(s) the change actually touched — before
   calling any change done.
9. Close every response with the Task Summary & Application Impact table above.
`;
}

/** Modular multi-stack mode, "anchor+item" targets only (GitHub Copilot, Claude Code): the shared content
 * for the ONE root anchor file when several stacks are each getting their own separate detail file.
 * Deliberately excludes the 10 directives and each stack's practices/anti-patterns — those live in the
 * per-stack files this anchor points to — so the guardrails that genuinely only make sense once (Universal
 * Guardrails, Cross-Stack Guardrails, end-of-session reporting) appear exactly once, never once per stack. */
export function buildSharedIndexBody(stacks: Stack[], customRules?: string): string {
  const label = comboLabel(stacks);
  const crossStackSection = renderCrossStackSection(stacks, label);
  const customSection = renderCustomRulesSection(customRules);

  return [crossStackSection, customSection, UNIVERSAL_GUARDRAILS_MD, OPERATIONAL_GUARDRAILS_MD, GIT_WORKFLOW_MD, END_OF_SESSION_REPORTING_MD]
    .filter(Boolean)
    .join("\n\n");
}
