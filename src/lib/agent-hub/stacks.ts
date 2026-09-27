/**
 * Agent Hub — stack catalogue. Each entry drives `templates/masterAgent.ts`, which folds everything
 * here (best practices, agent behavior, file globs, anti-patterns) into one consolidated
 * `.github/agents/<slug>-agent.md` master file per stack. Adding a stack here is the only step needed
 * to offer it in the UI — `AgentHub.tsx` renders this list directly.
 */
export type StackId =
  | "python"
  | "java"
  | "go"
  | "rust"
  | "typescript"
  | "fastapi"
  | "django"
  | "nodejs"
  | "spring-boot"
  | "rails"
  | "dotnet"
  | "react"
  | "nextjs"
  | "vue"
  | "angular"
  | "tailwind"
  | "flutter"
  | "docker-k8s"
  | "terraform"
  | "sql-prisma"
  | "postgresql"
  | "mongodb";

export type StackCategory = "Languages" | "Backend & APIs" | "Frontend" | "Mobile" | "Database" | "Tools";

/** Coarse role used by the cross-stack guardrail engine and the combined-mode document sections
 * ("Frontend Rules", "Backend Rules", "Database Rules", "Tools & Infra Rules"). Several categories can
 * map to the same role — e.g. both "Languages" and "Backend & APIs" stacks can act as a backend depending
 * on what else is selected, so this is assigned per-stack, not derived from `category` alone. */
export type StackRole = "frontend" | "backend" | "database" | "mobile" | "tools";

export type Stack = {
  id: StackId;
  label: string;
  tagline: string;
  /** Groups the picker into scannable sections once the catalogue gets this big. */
  category: StackCategory;
  /** Which combined-mode document section this stack's rules land under, and which cross-stack
   * guardrails it can trigger (see `cross-stack.ts`). */
  role: StackRole;
  /** File-name-safe slug used for the specialist agent file, e.g. "fastapi-specialist.md". */
  slug: string;
  /** Emoji shown in the picker — purely decorative, keeps the grid scannable. */
  emoji: string;
  /** Best-practice bullets that become `instructions/stack-specialist.md`. */
  practices: string[];
  /** Idiom/pattern bullets specific to how this stack's specialist agent should reason and act. */
  agentFocus: string[];
  /** File globs the specialist agent should treat as its primary surface. */
  fileGlobs: string[];
  /** A couple of realistic anti-patterns the agent should flag on sight. */
  antiPatterns: string[];
};

export const STACKS: Stack[] = [
  {
    id: "python",
    label: "Python",
    tagline: "Type hints, Ruff/Poetry, PEP 8",
    category: "Languages",
    role: "backend",
    slug: "python",
    emoji: "🐍",
    practices: [
      "Full type hints on every public function/method signature; run `mypy --strict` in CI.",
      "Use `Poetry` (or `uv`) for dependency management — never hand-edit `requirements.txt` for app code.",
      "Format and lint with `ruff` (`ruff format`, `ruff check --fix`); no bare `except:`.",
      "Prefer `dataclasses` / `pydantic` models over untyped dicts for structured data crossing a boundary.",
      "Use context managers (`with`) for every resource that must be closed — files, locks, DB connections.",
      "Avoid mutable default arguments (`def f(x=[])`); use `None` + a guard instead.",
    ],
    agentFocus: [
      "Reads type hints and docstrings before proposing a signature change; keeps `mypy --strict` green.",
      "Flags mutable-default-argument bugs and unclosed resources (missing `with`/`try`/`finally`).",
      "Prefers `pathlib.Path` over string path concatenation, and `logging` over bare `print`.",
    ],
    fileGlobs: ["**/*.py", "pyproject.toml"],
    antiPatterns: ["Bare `except:` that swallows every exception", "Mutable default arguments", "Untyped public function signatures"],
  },
  {
    id: "java",
    label: "Java",
    tagline: "Java 21, records, streams",
    category: "Languages",
    role: "backend",
    slug: "java",
    emoji: "☕",
    practices: [
      "Target Java 21 LTS: use records for immutable data carriers, sealed interfaces for closed hierarchies, and pattern matching in `switch`.",
      "Prefer `Optional<T>` return types over returning `null` from public APIs.",
      "Use `var` only when the right-hand side already makes the type obvious.",
      "Favor immutable collections (`List.of`, `Collections.unmodifiableList`) at API boundaries.",
      "Run static analysis with SpotBugs/Error Prone in CI; treat new warnings as build failures.",
      "Use try-with-resources for every `AutoCloseable`.",
    ],
    agentFocus: [
      "Reaches for records and sealed interfaces before hand-rolled POJOs with boilerplate getters/setters.",
      "Flags any public method that can return `null` instead of `Optional`.",
      "Checks that streams are not used for side effects only — prefer a plain loop when there's no transformation.",
    ],
    fileGlobs: ["**/*.java", "pom.xml", "build.gradle*"],
    antiPatterns: ["Returning `null` instead of `Optional`", "Checked-exception swallowing (`catch (Exception e) {}`)", "God classes with 20+ public methods"],
  },
  {
    id: "fastapi",
    label: "FastAPI",
    tagline: "Async, Pydantic v2, DI",
    category: "Backend & APIs",
    role: "backend",
    slug: "fastapi",
    emoji: "⚡",
    practices: [
      "Use `async def` route handlers end-to-end; never call blocking I/O (sync DB drivers, `requests`) inside one without `run_in_threadpool`.",
      "Model every request/response body with Pydantic v2 (`BaseModel`, `model_config = ConfigDict(...)`); avoid raw `dict` payloads.",
      "Use FastAPI's `Depends()` for shared logic (auth, DB sessions, pagination) instead of duplicating it per route.",
      "Let Pydantic + response_model generate OpenAPI docs — don't hand-write schemas that can drift.",
      "Return proper HTTP status codes via `HTTPException`, never a 200 with an `{\"error\": ...}` body.",
      "Use `lifespan` context managers for startup/shutdown (DB pools, background tasks) — not deprecated `@app.on_event`.",
    ],
    agentFocus: [
      "Checks every route for accidental blocking calls inside `async def` and suggests `run_in_threadpool` or an async driver.",
      "Keeps Pydantic v2 idioms (`model_validate`, `model_dump`) rather than v1 (`.dict()`, `.parse_obj()`).",
      "Pushes cross-cutting concerns into `Depends()` rather than route-body duplication.",
    ],
    fileGlobs: ["**/*.py", "app/**/routers/**", "app/**/schemas/**"],
    antiPatterns: ["Blocking calls inside `async def`", "Pydantic v1 methods in a v2 codebase", "Business logic embedded directly in route handlers"],
  },
  {
    id: "react",
    label: "React",
    tagline: "Hooks, memoization, a11y",
    category: "Frontend",
    role: "frontend",
    slug: "react",
    emoji: "⚛️",
    practices: [
      "Prefer function components + hooks; no new class components.",
      "Keep `useEffect` dependency arrays exhaustive — don't silence the lint rule to hide a bug.",
      "Memoize expensive derived values with `useMemo`/callbacks with `useCallback` only when profiling shows it matters, not by default everywhere.",
      "Co-locate component, styles and tests; keep components under ~200 lines by extracting hooks.",
      "Always give interactive elements accessible roles/labels — no `<div onClick>` standing in for a `<button>`.",
      "Lift state only as high as the nearest common consumer needs; avoid global state for local UI concerns.",
    ],
    agentFocus: [
      "Checks `useEffect`/`useCallback`/`useMemo` dependency arrays for correctness before performance.",
      "Flags `<div>`/`<span>` used as clickable controls without `role`, `tabIndex` and keyboard handling.",
      "Prefers composition (children, render props) over prop-drilling more than two levels deep.",
    ],
    fileGlobs: ["src/**/*.tsx", "src/**/*.jsx"],
    antiPatterns: ["Missing/incorrect `useEffect` dependencies", "Non-semantic clickable `<div>`s", "Inline object/array literals as props causing needless re-renders in hot paths"],
  },
  {
    id: "nextjs",
    label: "Next.js",
    tagline: "App Router, RSC, caching",
    category: "Frontend",
    role: "frontend",
    slug: "nextjs",
    emoji: "▲",
    practices: [
      "Default to Server Components; add `\"use client\"` only where interactivity or browser APIs are required.",
      "Use Route Handlers (`app/api/**/route.ts`) for server logic, not `pages/api` (legacy).",
      "Fetch data in Server Components / Server Actions, not `useEffect` + client fetch, unless the data is truly client-only.",
      "Be explicit about caching: `fetch(url, { cache: \"no-store\" })` or `revalidate` — don't rely on the implicit default and be surprised later.",
      "Use `next/image` and `next/font` for anything user-facing; never hand-roll `<img>` for content images.",
      "Keep Server Actions small and validated (zod) — treat every argument as untrusted input, exactly like an API route.",
    ],
    agentFocus: [
      "Defaults new components to Server Components and only adds `\"use client\"` when the diff actually needs state, effects or browser APIs.",
      "Checks that any Server Action validates its input before touching the database.",
      "Calls out unbounded `fetch` caching or missing `revalidate`/`cache` directives that could serve stale data.",
    ],
    fileGlobs: ["src/app/**/*.tsx", "src/app/**/route.ts"],
    antiPatterns: ["\"use client\" added out of habit rather than necessity", "Unvalidated Server Action input", "Client-side data fetching for data available at render time"],
  },
  {
    id: "nodejs",
    label: "Node.js",
    tagline: "Async patterns, streams, errors",
    category: "Backend & APIs",
    role: "backend",
    slug: "nodejs",
    emoji: "🟩",
    practices: [
      "Use `async`/`await` with `try`/`catch`; never leave an unhandled promise rejection.",
      "Use streams for large payloads instead of buffering entire files/responses in memory.",
      "Centralize error handling (Express: an error-handling middleware; Fastify: an `setErrorHandler`) rather than per-route try/catch duplication.",
      "Validate all external input (body, query, headers) with a schema library (zod/joi) at the boundary.",
      "Never block the event loop with synchronous CPU-heavy work — offload to a worker thread or a queue.",
      "Pin dependency versions and audit regularly (`npm audit`, Dependabot/Renovate).",
    ],
    agentFocus: [
      "Flags missing `.catch()`/`try-catch` around any `await` on a call that can reject.",
      "Watches for synchronous blocking calls (`fs.readFileSync`, heavy loops) on hot request paths.",
      "Pushes input validation to the edge of the request, not deep inside business logic.",
    ],
    fileGlobs: ["src/**/*.ts", "src/**/*.js"],
    antiPatterns: ["Unhandled promise rejections", "Synchronous I/O on the request path", "Business logic that trusts unvalidated request input"],
  },
  {
    id: "spring-boot",
    label: "Spring Boot",
    tagline: "Security, JPA, JUnit 5",
    category: "Backend & APIs",
    role: "backend",
    slug: "spring-boot",
    emoji: "🌱",
    practices: [
      "Use constructor injection (`final` fields, no field `@Autowired`) for testability.",
      "Keep Spring Security config explicit: default-deny, then allow-list public endpoints.",
      "Watch for N+1 queries with JPA/Hibernate — use `@EntityGraph` or explicit fetch joins for known access patterns.",
      "Use DTOs at controller boundaries; never return `@Entity` objects directly from a REST endpoint.",
      "Write tests with JUnit 5 + `@SpringBootTest`/`@WebMvcTest` slices, not one giant integration test per feature.",
      "Externalize configuration via `application.yml` + profiles — no hard-coded environment values.",
    ],
    agentFocus: [
      "Reviews new JPA queries for N+1 risk before merge and suggests `@EntityGraph`/fetch joins.",
      "Insists on constructor injection and flags field-level `@Autowired`.",
      "Checks Spring Security rules default to deny, with explicit allow-lists rather than broad `permitAll()`.",
    ],
    fileGlobs: ["src/main/java/**/*.java", "src/test/java/**/*.java"],
    antiPatterns: ["Field injection via `@Autowired`", "Entities returned directly from controllers", "Overly permissive `permitAll()` security rules"],
  },
  {
    id: "go",
    label: "Go",
    tagline: "Errors, goroutines, context",
    category: "Languages",
    role: "backend",
    slug: "go",
    emoji: "🐹",
    practices: [
      "Check every error explicitly; never `_ = err` outside of tests or truly best-effort cleanup.",
      "Pass `context.Context` as the first argument through call chains that can be cancelled or time out.",
      "Keep goroutines' lifetimes obvious — every goroutine should have a clear owner and shutdown path (no fire-and-forget leaks).",
      "Prefer small interfaces defined by the consumer, not large interfaces defined by the producer.",
      "Use `go vet`, `staticcheck` and `golangci-lint` in CI.",
      "Wrap errors with context (`fmt.Errorf(\"...: %w\", err)`) rather than losing the chain.",
    ],
    agentFocus: [
      "Flags ignored errors and goroutines with no visible cancellation/shutdown path.",
      "Checks that `context.Context` is threaded through instead of `context.Background()` used deep in a call chain.",
      "Prefers `%w` error wrapping over `%v` when the original error should stay inspectable.",
    ],
    fileGlobs: ["**/*.go", "go.mod"],
    antiPatterns: ["Ignored error returns", "Goroutines with no owner or cancellation path", "Large producer-defined interfaces instead of small consumer-defined ones"],
  },
  {
    id: "rust",
    label: "Rust",
    tagline: "Ownership, Result, Clippy",
    category: "Languages",
    role: "backend",
    slug: "rust",
    emoji: "🦀",
    practices: [
      "Prefer `Result<T, E>` + `?` over `.unwrap()`/`.expect()` outside of tests and truly-impossible cases.",
      "Run `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` in CI.",
      "Minimize `unsafe` blocks; each one needs a `// SAFETY:` comment explaining the invariant it upholds.",
      "Model domain state with enums, not boolean flags or stringly-typed state.",
      "Use `thiserror` for library error types and `anyhow` for application-level error handling.",
      "Prefer borrowing (`&T`) over cloning when ownership doesn't actually need to move.",
    ],
    agentFocus: [
      "Flags `.unwrap()`/`.expect()` on paths that can realistically fail in production.",
      "Checks every `unsafe` block carries a `// SAFETY:` comment justifying it.",
      "Suggests borrowing over unnecessary `.clone()` calls once ownership requirements are clear.",
    ],
    fileGlobs: ["**/*.rs", "Cargo.toml"],
    antiPatterns: ["`.unwrap()` on fallible operations outside tests", "`unsafe` without a `// SAFETY:` justification", "Stringly-typed state instead of enums"],
  },
  {
    id: "vue",
    label: "Vue",
    tagline: "Composition API, reactivity",
    category: "Frontend",
    role: "frontend",
    slug: "vue",
    emoji: "💚",
    practices: [
      "Prefer the Composition API (`<script setup>`) over the Options API for new components.",
      "Keep reactive state minimal — derive computed values with `computed()` instead of duplicating state.",
      "Extract shared reactive logic into composables (`useX()`), not mixins.",
      "Type props and emits explicitly with `defineProps<T>()` / `defineEmits<T>()` in TypeScript projects.",
      "Avoid mutating props directly; emit an event and let the parent own the state change.",
      "Use `v-for` with a stable `:key`, never the array index when the list can reorder.",
    ],
    agentFocus: [
      "Nudges Options API components toward `<script setup>` when touched, without forcing a wholesale rewrite.",
      "Flags direct prop mutation and array-index `:key` usage on reorderable lists.",
      "Extracts repeated reactive logic across components into a composable.",
    ],
    fileGlobs: ["src/**/*.vue"],
    antiPatterns: ["Direct prop mutation", "Array-index `:key` on reorderable lists", "Duplicated reactive logic instead of a shared composable"],
  },
  {
    id: "angular",
    label: "Angular",
    tagline: "Standalone, signals, RxJS",
    category: "Frontend",
    role: "frontend",
    slug: "angular",
    emoji: "🅰️",
    practices: [
      "Prefer standalone components over `NgModule`-based ones for new code.",
      "Use Signals for simple local state; reserve RxJS for genuinely asynchronous/event streams.",
      "Unsubscribe from every manual `.subscribe()` (via `takeUntilDestroyed()` or the `async` pipe) to avoid leaks.",
      "Use the `OnPush` change detection strategy by default for presentational components.",
      "Keep business logic in injectable services, not components — components should stay thin.",
      "Type reactive forms explicitly (`FormGroup<{...}>`) instead of leaving them as `any`.",
    ],
    agentFocus: [
      "Checks every manual `.subscribe()` for a corresponding teardown (`takeUntilDestroyed`, `async` pipe, or explicit `unsubscribe`).",
      "Prefers Signals over a `BehaviorSubject` for state that isn't actually a stream.",
      "Keeps components thin and pushes logic into services.",
    ],
    fileGlobs: ["src/**/*.ts", "src/**/*.html"],
    antiPatterns: ["`.subscribe()` with no teardown", "Fat components holding business logic", "Untyped reactive forms"],
  },
  {
    id: "docker-k8s",
    label: "Docker / K8s",
    tagline: "Multi-stage builds, manifests",
    category: "Tools",
    role: "tools",
    slug: "docker-k8s",
    emoji: "🐳",
    practices: [
      "Use multi-stage Dockerfiles: build in one stage, copy only the runtime artifact into a minimal final image.",
      "Never run the container process as root — set a non-root `USER` in the final stage.",
      "Pin base image versions/digests; don't float on `:latest` in anything deployed.",
      "Set resource `requests`/`limits` on every Kubernetes container — no unbounded pods.",
      "Define liveness and readiness probes distinctly; a readiness failure shouldn't restart a healthy process.",
      "Keep secrets out of images and manifests — use a Secret store / external-secrets operator, never a baked-in `.env`.",
    ],
    agentFocus: [
      "Reviews Dockerfiles for missing multi-stage builds, root users, and floating `:latest` tags.",
      "Checks Kubernetes manifests for missing resource requests/limits and probes.",
      "Flags any secret value that looks hard-coded into an image layer or manifest.",
    ],
    fileGlobs: ["**/Dockerfile*", "**/*.yaml", "**/*.yml"],
    antiPatterns: ["Containers running as root", "Floating `:latest` base images in deployed manifests", "Secrets baked into image layers"],
  },
  {
    id: "sql-prisma",
    label: "SQL / Prisma",
    tagline: "Migrations, indexes, N+1",
    category: "Database",
    role: "database",
    slug: "sql-prisma",
    emoji: "🗄️",
    practices: [
      "Every schema change goes through a migration (`prisma migrate dev`/`deploy`) — never hand-edit the production DB.",
      "Index every column used in a `WHERE`, `ORDER BY` or join on a table with meaningful row counts.",
      "Use `include`/`select` deliberately in Prisma queries to avoid over-fetching and N+1 patterns in loops.",
      "Wrap multi-statement writes that must succeed or fail together in a transaction (`prisma.$transaction`).",
      "Never build raw SQL by string-concatenating user input — use parameterized queries (`$queryRaw` with tagged templates) if raw SQL is unavoidable.",
      "Keep migrations reversible where practical, and always review the generated SQL before applying it in production.",
    ],
    agentFocus: [
      "Flags Prisma calls inside a loop that should be a single batched query with `include`.",
      "Checks that multi-step writes are wrapped in `$transaction`.",
      "Rejects any string-concatenated SQL and points to parameterized alternatives.",
    ],
    fileGlobs: ["prisma/schema.prisma", "**/*.sql", "src/**/*.ts"],
    antiPatterns: ["N+1 query patterns from per-row Prisma calls in a loop", "Unindexed columns driving frequent filters/sorts", "String-concatenated raw SQL"],
  },
  {
    id: "typescript",
    label: "TypeScript",
    tagline: "Strict mode, generics, no `any`",
    category: "Languages",
    role: "frontend",
    slug: "typescript",
    emoji: "🔷",
    practices: [
      "Enable `strict: true` (and `noUncheckedIndexedAccess`) in `tsconfig.json` — never loosen it to silence errors.",
      "Never use `any` to make a type error go away; reach for `unknown` + a narrowing guard, or fix the actual type.",
      "Model domain state with discriminated unions instead of optional fields that are only sometimes valid together.",
      "Prefer `type` aliases for unions/utility shapes and `interface` for object shapes meant to be extended — pick one convention per repo and stay consistent with it.",
      "Validate data crossing a real boundary (network, file, env var) at runtime with a schema library (zod/valibot) — a `as Type` cast is not validation.",
      "Keep generics constrained (`<T extends X>`) rather than unconstrained `<T>` that just defers the type error somewhere else.",
    ],
    agentFocus: [
      "Refuses to introduce a new `any` or `@ts-ignore` without a comment explaining why nothing narrower works.",
      "Reaches for discriminated unions over collections of optional/nullable fields describing the same entity.",
      "Checks that anything parsed from outside the process (JSON, env, form data) is runtime-validated, not just type-asserted.",
    ],
    fileGlobs: ["**/*.ts", "**/*.tsx", "tsconfig.json"],
    antiPatterns: ["`any` or `@ts-ignore` used to silence a real type error", "Runtime-unchecked type assertions (`as Type`) on external data", "Optional-field soup instead of a discriminated union"],
  },
  {
    id: "django",
    label: "Django",
    tagline: "ORM, DRF, migrations",
    category: "Backend & APIs",
    role: "backend",
    slug: "django",
    emoji: "🎸",
    practices: [
      "Every model change ships its own migration (`makemigrations`); never hand-edit a generated migration's schema operations after the fact.",
      "Use `select_related`/`prefetch_related` deliberately wherever a queryset is iterated with related-object access — the classic Django N+1 source.",
      "Model serialization and validation with Django REST Framework serializers, not hand-rolled `dict()` building in the view.",
      "Keep business logic in model methods / a services layer, not in views — views should stay thin (parse, call, respond).",
      "Use Django's built-in auth, CSRF protection and `ALLOWED_HOSTS`/`SECURE_*` settings — don't disable them to unblock local testing and forget to re-enable them.",
      "Read all secrets and environment-specific config from environment variables (`django-environ`/`os.environ`), never hard-coded in `settings.py`.",
    ],
    agentFocus: [
      "Flags queryset iteration that triggers related-object queries per row instead of `select_related`/`prefetch_related`.",
      "Keeps views thin and pushes logic into model methods, a services module, or a DRF serializer's `validate_*`.",
      "Checks that `DEBUG`, `SECRET_KEY` and `ALLOWED_HOSTS` are environment-driven, never a hard-coded production value.",
    ],
    fileGlobs: ["**/models.py", "**/views.py", "**/serializers.py", "**/migrations/**"],
    antiPatterns: ["N+1 queries from unprefetched related-object access in a loop", "Business logic embedded in views instead of models/services", "`DEBUG = True` or a hard-coded `SECRET_KEY` outside local dev settings"],
  },
  {
    id: "rails",
    label: "Ruby on Rails",
    tagline: "Convention, ActiveRecord, RSpec",
    category: "Backend & APIs",
    role: "backend",
    slug: "rails",
    emoji: "💎",
    practices: [
      "Follow Rails convention over configuration — don't fight the framework's naming/structure defaults without a documented reason.",
      "Use `includes`/`eager_load` for any association accessed inside a loop or view partial to avoid N+1 queries; catch regressions with the Bullet gem in development.",
      "Push validation and business rules into the model (validations, callbacks used sparingly) or a service/PORO, not into fat controllers.",
      "Use strong parameters (`params.require(...).permit(...)`) on every mass-assignment — never `params.permit!`.",
      "Write request/model specs with RSpec covering happy path, validation failures and edge cases; use factories (FactoryBot), not fixtures, for new specs.",
      "Run `bundle audit` and keep gems patched — Rails' popularity makes known CVEs a real, actively-scanned-for risk.",
    ],
    agentFocus: [
      "Flags association access inside a loop or view that isn't backed by `includes`/`eager_load`.",
      "Rejects `params.permit!` and any mass-assignment that skips strong parameters.",
      "Keeps controllers thin — pushes non-trivial logic into models, service objects, or POROs instead.",
    ],
    fileGlobs: ["app/models/**/*.rb", "app/controllers/**/*.rb", "spec/**/*.rb"],
    antiPatterns: ["N+1 queries from un-eager-loaded associations", "`params.permit!` bypassing strong parameters", "Fat controllers holding business logic that belongs in a model or service"],
  },
  {
    id: "dotnet",
    label: "C# / .NET",
    tagline: "Nullable refs, async, EF Core",
    category: "Backend & APIs",
    role: "backend",
    slug: "dotnet",
    emoji: "🟣",
    practices: [
      "Enable nullable reference types project-wide (`<Nullable>enable</Nullable>`) and treat new warnings as build failures.",
      "Use `async`/`await` all the way down for I/O — never `.Result`/`.Wait()` on a `Task`, which can deadlock in ASP.NET contexts.",
      "Model request/response contracts with records (`record` types) and validate them with data annotations or FluentValidation at the API boundary.",
      "Use EF Core's `Include`/`AsNoTracking` deliberately; watch for lazy-loading-driven N+1 queries in list endpoints.",
      "Use dependency injection via the built-in container (constructor injection) — avoid static singletons/service locators for anything testable.",
      "Keep configuration and secrets in `appsettings.{Environment}.json` + user-secrets/environment variables, never committed plaintext connection strings.",
    ],
    agentFocus: [
      "Flags synchronous blocking on a `Task` (`.Result`, `.Wait()`) instead of `await`.",
      "Checks EF Core queries feeding a list endpoint for missing `Include`/`AsNoTracking` and lazy-loading N+1 risk.",
      "Prefers constructor-injected dependencies over static access for anything the tests need to substitute.",
    ],
    fileGlobs: ["**/*.cs", "**/*.csproj"],
    antiPatterns: ["Blocking on async code with `.Result`/`.Wait()`", "N+1 queries from unconfigured EF Core lazy loading", "Secrets or connection strings committed in `appsettings.json`"],
  },
  {
    id: "flutter",
    label: "Flutter / Dart",
    tagline: "Widgets, state mgmt, null-safety",
    category: "Mobile",
    role: "mobile",
    slug: "flutter",
    emoji: "🎯",
    practices: [
      "Keep widgets small and split by responsibility; extract a `StatelessWidget`/`StatelessWidget`-with-`const` rather than one deeply nested `build()` method.",
      "Mark every widget `const` where its constructor arguments allow it — this is the single biggest, cheapest rebuild-avoidance win in Flutter.",
      "Pick one state-management approach for the app (Provider/Riverpod/Bloc) and use it consistently — don't mix ad-hoc `setState` with a global state solution for the same data.",
      "Rely on Dart's sound null-safety fully; avoid `!` (null-assertion) unless the value's non-nullability is truly guaranteed and commented.",
      "Dispose every `AnimationController`/`TextEditingController`/`StreamSubscription` in `dispose()` — leaked controllers are a top source of memory issues.",
      "Write widget tests for user-visible behavior, not just unit tests for pure logic — Flutter's `testWidgets` catches regressions unit tests miss.",
    ],
    agentFocus: [
      "Adds `const` constructors wherever the widget's arguments are already compile-time constant.",
      "Flags a controller/subscription created without a matching `dispose()`.",
      "Keeps state-management approach consistent with what the rest of the app already uses rather than introducing a second pattern.",
    ],
    fileGlobs: ["lib/**/*.dart", "test/**/*.dart", "pubspec.yaml"],
    antiPatterns: ["Missing `dispose()` for controllers/subscriptions (memory leaks)", "Null-assertion (`!`) on values that aren't actually guaranteed non-null", "Mixed state-management patterns for the same piece of state"],
  },
  {
    id: "terraform",
    label: "Terraform / IaC",
    tagline: "Modules, state, plan review",
    category: "Tools",
    role: "tools",
    slug: "terraform",
    emoji: "🏗️",
    practices: [
      "Store remote state in a locked, versioned backend (S3+DynamoDB, Terraform Cloud, GCS) — never commit `.tfstate` to version control.",
      "Structure reusable infrastructure as modules with explicit `variable`/`output` contracts, not copy-pasted resource blocks per environment.",
      "Pin provider and module versions (`required_providers`, `version = \"~> x.y\"`); never float on an unconstrained provider version.",
      "Run `terraform plan` and require human review of the diff before every `apply` against a shared environment — no blind applies in CI without a plan gate.",
      "Never hard-code a secret (API key, password, connection string) in `.tf`/`.tfvars` — pull from a secrets manager or CI-injected environment variables and mark the variable `sensitive = true`.",
      "Use workspaces or separate state files per environment (dev/staging/prod) — don't share one state file across environments.",
    ],
    agentFocus: [
      "Checks that state is configured against a locked remote backend, never local/unversioned state for shared infrastructure.",
      "Flags unpinned provider/module versions and any resource block duplicated instead of factored into a module.",
      "Rejects hard-coded secrets in `.tf`/`.tfvars` and confirms sensitive variables are marked `sensitive = true`.",
    ],
    fileGlobs: ["**/*.tf", "**/*.tfvars"],
    antiPatterns: ["Local or unlocked remote Terraform state for shared infrastructure", "Hard-coded secrets in `.tf`/`.tfvars` files", "Unpinned provider/module versions"],
  },
  {
    id: "postgresql",
    label: "PostgreSQL",
    tagline: "Indexes, transactions, EXPLAIN",
    category: "Database",
    role: "database",
    slug: "postgresql",
    emoji: "🐘",
    practices: [
      "Every schema change ships as a versioned migration (via whatever migration tool the app layer uses) — never a hand-run `ALTER TABLE` against production.",
      "Index every column driving a frequent `WHERE`, `JOIN` or `ORDER BY` on a table with meaningful row counts; verify with `EXPLAIN ANALYZE`, don't guess.",
      "Wrap multi-statement writes that must succeed or fail together in an explicit transaction (`BEGIN`/`COMMIT`), and pick the isolation level deliberately when the default (`READ COMMITTED`) isn't enough.",
      "Use parameterized queries / prepared statements exclusively — never string-concatenate a value into SQL, including for `LIKE` patterns or identifiers.",
      "Prefer `NOT NULL` with explicit defaults over nullable columns the application has to null-check everywhere; use `CHECK` constraints for invariants the database can enforce cheaply.",
      "Use connection pooling (PgBouncer or the driver/ORM's own pool) sized to the app's real concurrency — don't open a new connection per request.",
    ],
    agentFocus: [
      "Checks new queries against likely index coverage and suggests `EXPLAIN ANALYZE` before assuming a query is fast enough.",
      "Rejects string-built SQL and points to parameterized queries.",
      "Flags multi-statement writes that should be wrapped in a transaction but aren't.",
    ],
    fileGlobs: ["**/*.sql", "**/migrations/**"],
    antiPatterns: ["String-concatenated SQL", "Missing indexes on frequently filtered/joined columns", "Multi-step writes with no transaction wrapping them"],
  },
  {
    id: "mongodb",
    label: "MongoDB",
    tagline: "Schemas, indexes, aggregation",
    category: "Database",
    role: "database",
    slug: "mongodb",
    emoji: "🍃",
    practices: [
      "Validate document shape at the application layer (a schema library matching your stack — Pydantic, Mongoose, a Zod-backed layer) even though MongoDB itself is schema-flexible; flexible storage is not a substitute for validated writes.",
      "Design indexes around real query patterns (`explain(\"executionStats\")` to verify) — a collection scanned on every read is a production incident waiting to happen.",
      "Model relationships deliberately: embed for data that's read together and doesn't grow unbounded, reference (with a manual join in the app or `$lookup`) for data that's large, shared, or updated independently.",
      "Use multi-document transactions only when an operation genuinely needs atomicity across documents/collections — prefer single-document atomic updates (`$set`, `$inc`, array operators) where the data model allows it.",
      "Never build a query filter by string-interpolating user input — use the driver's parameterized query object form to avoid NoSQL injection via operators like `$where`/`$regex`.",
      "Set sane connection pool sizes and timeouts on the driver; watch for unbounded `find()` results — always paginate with `limit`/cursor-based pagination on user-facing lists.",
    ],
    agentFocus: [
      "Checks that write paths validate document shape at the application layer, not just trust whatever shape arrives.",
      "Reviews new query patterns for index coverage before assuming they'll scale past a handful of documents.",
      "Rejects filters built by string-interpolating user input and flags unbounded `find()` calls with no pagination.",
    ],
    fileGlobs: ["**/models/**", "**/schemas/**", "**/*.mongo.*"],
    antiPatterns: ["Unvalidated document writes", "Missing indexes on frequently queried fields", "NoSQL injection via string-built filters or unsanitized `$where`/`$regex`"],
  },
  {
    id: "tailwind",
    label: "Tailwind CSS",
    tagline: "Utility-first, design tokens",
    category: "Tools",
    role: "tools",
    slug: "tailwind",
    emoji: "🎨",
    practices: [
      "Keep design tokens (color, spacing, radius, font scale) in the Tailwind theme config, not as one-off arbitrary values (`w-[13px]`) scattered through components.",
      "Prefer composing existing utilities over reaching for `@apply` to build a new bespoke class — `@apply` should be rare, for a handful of truly repeated, non-componentized patterns.",
      "Extract a component (React/Vue/etc.) instead of copy-pasting a long utility class string across multiple places that should stay visually in sync.",
      "Use the framework's built-in responsive (`sm:`/`md:`/`lg:`) and state (`hover:`/`focus:`/`dark:`) variants instead of hand-written media queries or JS-driven class toggling for things Tailwind already expresses declaratively.",
      "Run the Tailwind build with content-path purging correctly configured — an overly broad or too-narrow `content` glob either bloats the CSS bundle or silently drops used classes in production.",
      "Keep accessibility in mind independent of the utility classes used: focus rings (`focus-visible:`), sufficient contrast, and semantic HTML — Tailwind styles the box, it doesn't make the markup accessible.",
    ],
    agentFocus: [
      "Prefers theme tokens and existing utility composition over new arbitrary values or ad-hoc `@apply` classes.",
      "Suggests extracting a component when the same long utility string is duplicated across files.",
      "Checks that interactive elements keep a visible focus state and adequate contrast regardless of how they're styled.",
    ],
    fileGlobs: ["**/*.tsx", "**/*.jsx", "**/*.vue", "tailwind.config.*"],
    antiPatterns: ["Arbitrary one-off values instead of theme tokens", "Long duplicated utility strings that should be a component", "Missing focus/hover states on interactive elements"],
  },
];

export const getStack = (id: StackId) => STACKS.find((s) => s.id === id)!;
