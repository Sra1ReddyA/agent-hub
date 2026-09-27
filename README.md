# Agent Hub

**Agent Hub generates AI coding agent configuration for the tool your team actually uses — GitHub
Copilot, Claude Code, Cursor, Windsurf, Cline, Continue.dev, Aider, and the open `AGENTS.md`
convention.** Build a real, multi-technology stack — Python + FastAPI + React + MongoDB, or whatever your
repo actually runs — and merge it into one cross-stack-aware agent, or keep every stack in its own file.
Preview every generated file, download a zip that extracts straight into your repository. Everything runs
in your browser: no backend, no sign-up, no API key, nothing you generate is ever uploaded anywhere.

It is **not** an AI product itself. The generator is deterministic — the same stack + target selection
always produces the same output — built from hand-written best-practice data, not a language model. There
is nothing to wait for and nothing that can hallucinate.

---

## Table of contents

- [What it does](#what-it-does)
- [Why this exists](#why-this-exists)
- [Supported stacks](#supported-stacks)
- [Supported AI coding tools](#supported-ai-coding-tools)
- [The 10 Core Operating Directives](#the-10-core-operating-directives)
- [Universal Guardrails](#universal-guardrails)
- [Cross-Stack Guardrails](#cross-stack-guardrails)
- [Generation modes: Combined vs. Modular](#generation-modes-combined-vs-modular)
- [What makes this different: the team layer](#what-makes-this-different-the-team-layer)
- [How it's built (architecture)](#how-its-built-architecture)
- [Run it locally](#run-it-locally)
- [Build it for production](#build-it-for-production)
- [Deploy it](#deploy-it)
  - [Vercel](#vercel-recommended)
  - [Docker](#docker)
  - [Any other Node host](#any-other-node-host-netlify-render-flyio-a-vps)
  - [Static export (no server needed)](#static-export-no-server-needed)
- [Environment variables](#environment-variables)
- [Admin dashboard & usage analytics](#admin-dashboard--usage-analytics)
- [Extending Agent Hub](#extending-agent-hub)
  - [Add a new stack](#add-a-new-stack)
  - [Add a new target (AI coding tool)](#add-a-new-target-ai-coding-tool)
- [Project structure](#project-structure)
- [Design principles](#design-principles)
- [FAQ](#faq)
- [License](#license)

---

## What it does

1. **Build your stack.** 22 options across six categories — Languages, Backend & APIs, Frontend, Database,
   Mobile, Tools. Check as many as apply — a single stack, or a full custom combination like Python +
   FastAPI + React + MongoDB. Each stack carries real, specific best practices, a type-safety idiom, a
   performance concern, primary file globs, and anti-patterns to flag on sight.
2. **Choose Combined or Modular.** Combined (the default) merges every selected stack into one
   cross-stack-aware agent, plus a universal `.agent.md` at your repo root. Modular gives each stack its
   own independent file per tool instead. See [Generation modes](#generation-modes-combined-vs-modular).
3. **Pick your AI coding tool(s).** Any number, at once. Each tool gets its own correctly-formatted
   file(s), placed exactly where that tool expects to find them — a Cursor `.mdc` with YAML frontmatter, a
   Claude Code `CLAUDE.md` plus an installable subagent, a flat Windsurf `.windsurfrules`, and so on. All
   of them are generated from the **same** underlying content, so switching tools — or supporting several
   at once — never means rewriting your standards twice.
4. **Preview, then download.** Every generated file is previewable and copyable individually in the
   browser. The download is a single zip with every file at its real, project-root-relative path —
   extract it directly into your repository and you're done.

Every bundle, whatever stacks/mode/tools you pick, automatically embeds the [Universal
Guardrails](#universal-guardrails) (code quality, error handling, token efficiency, security) and the
mandatory end-of-session Task Summary & Application Impact chart — see below.

Read the in-app [**Guides page**](#) (`/guides` once running) for a walkthrough of what these files
actually change, exactly how each supported tool discovers and reads its file, what's worth customizing
before you commit it, and how to write effective directives from scratch if you'd rather build your own.

## Why this exists

Every one of these tools reads some form of repository-level context before it starts working — a system
prompt silently prepended to every request in that repo. Left at its defaults, that context is generic. An
instruction file turns "please remember to validate input" and "we use `Result<T, E>`, not `.unwrap()`"
from something you repeat every session into something the agent already knows before you ask — and,
because it's committed to the repo, something every contributor's agent knows too.

Most instruction-file setups either stay too generic to change behavior, or get split across several
small files (`security-auditor.md`, `test-generator.md`, a specialist file per stack) that most tools load
in their entirety anyway — you pay the context cost of all of them, with none of the benefit of separation.
Agent Hub generates **one consolidated Master Agent per stack**: token efficiency, testing rigor, OWASP
security review and stack-specific idioms all enforced together, in one file, on every change.

## Supported stacks

| Category | Stacks |
|---|---|
| **Languages** | Python, Java, Go, Rust, TypeScript |
| **Backend & APIs** | FastAPI, Django, Node.js, Spring Boot, Ruby on Rails, C# / .NET |
| **Frontend** | React, Next.js, Vue, Angular |
| **Database** | PostgreSQL, MongoDB, SQL / Prisma |
| **Mobile** | Flutter / Dart |
| **Tools** | Docker / Kubernetes, Terraform, Tailwind CSS |

22 stacks today, and you can select any number of them at once — Agent Hub isn't limited to one stack per
bundle. Every stack also carries a coarse **role** (`frontend` / `backend` / `database` / `mobile` /
`tools`), independent of its display category, which drives which document section it lands in and which
[Cross-Stack Guardrails](#cross-stack-guardrails) it can trigger. Adding one more stack is a single
data-file change — see [Add a new stack](#add-a-new-stack).

## Supported AI coding tools

| Tool | Vendor | Files generated |
|---|---|---|
| **GitHub Copilot** | GitHub | `.github/copilot-instructions.md`, `.github/agents/<slug>-agent.md` |
| **Claude Code** | Anthropic | `CLAUDE.md`, `.claude/agents/<slug>-agent.md` |
| **Cursor** | Anysphere | `.cursor/rules/<slug>-agent.mdc` (with frontmatter, `alwaysApply: true`) |
| **Windsurf** | Cognition | `.windsurfrules` |
| **Cline** | Cline (VS Code ext.) | `.clinerules/<slug>-agent.md` |
| **Continue.dev** | Continue | `.continue/rules/<slug>-agent.md` |
| **Aider** | Aider (open source) | `CONVENTIONS.md`, `.aider.conf.yml` |
| **AGENTS.md** | Open, multi-vendor | `AGENTS.md` — a sane universal fallback for any tool without dedicated support here |

Full setup instructions for each — how the tool discovers the file, what to commit, how to verify it's
working — are on the in-app Guides page, generated straight from the same data file
(`src/lib/agent-hub/targets.ts`) that drives the picker, so they can never drift out of sync with the UI.

## The 10 Core Operating Directives

Every generated Master Agent file, for every stack and every tool, is built around the same ten
directives, filled in with that stack's specifics:

1. **Zero Hallucination & Codebase Verification** — read real files and real dependency versions before
   proposing a change; never invent an API, package or config option.
2. **Strict Type Safety & Schemas** — full type coverage at every boundary, in that stack's own idiom.
3. **Bug Prevention & Defensive Logic** — validate edge cases explicitly: empty, null, zero, negative,
   boundary, unexpected type.
4. **Token Efficiency** — the minimal correct diff; no full-file reprints, no narrated walkthroughs, no
   unrequested refactors.
5. **Comprehensive Unit Testing** — happy path, edge cases, and at least one failure mode for every new or
   changed unit.
6. **OWASP & Security Standards** — every external input is untrusted until validated; no hard-coded
   secrets; no injection/XSS/unsafe deserialization.
7. **Performance & Resource Management** — that stack's actual hot-path concern (N+1 queries, blocked
   event loops, goroutine leaks, unbounded buffering, …).
8. **Architectural Consistency** — match the repo's existing structure; flag inconsistency instead of
   silently picking a third pattern.
9. **Error Handling & Logging** — explicit, structured, actionable; no bare catch-and-ignore, no secrets
   in logs.
10. **Automated Documentation & README Sync** — mandatory: every feature, API or dependency change gets
    `README.md` updated in the same pass.

## Universal Guardrails

On top of the 10 stack-specific directives, every generated file — combined or modular, no exceptions —
embeds four standing rules and one standing reporting requirement, injected exactly once per document (not
once per stack, so a four-stack combined agent still only has one copy):

1. **Code Optimization & Quality** — clean, production-ready code; no unused imports, dead branches, debug
   leftovers, redundant computation, or resource/memory leaks.
2. **Error Handling & Validation** — rigorous error checking and defensive programming at every boundary;
   explicit handling of empty collections, null/undefined/None, zero, negative numbers, boundary values,
   malformed input, and network/I-O failures.
3. **Token Efficiency** — concise, structured, direct responses; minimal filler commentary; reference
   existing code by name/location instead of reprinting unchanged blocks.
4. **Security & Safety** — prevent SQL/NoSQL/command/template injection and XSS; never expose a secret, API
   key, credential or token; configure CORS and auth deliberately; validate input at every boundary, both
   server-side API routes/handlers and client-side forms.

Plus **Mandatory End-of-Session Reporting** — a standing instruction that every response conclude with a
Markdown table:

```markdown
### 📊 Task Summary & Application Impact
| File / Component Changed | Type of Modification | Business & Functional Impact |
| :--- | :--- | :--- |
| `src/components/Form.tsx` | Added validation & state update | Prevents invalid payloads from hitting backend |
| `app/api/endpoints.py` | Added FastAPI response schema | Enforces strict type contracts & fixes CORS issue |
```

This content lives in one place — `src/lib/agent-hub/templates/universalGuardrails.ts` — and is imported by
the Master Agent builder, never hand-copied per stack.

## Cross-Stack Guardrails

When your selection spans more than one stack, Agent Hub adds a **Cross-Stack Guardrails** section
automatically — guidance that only makes sense once multiple layers are in the same agent. Two tiers feed
it, so it scales without hand-writing every possible pairing among 22 stacks:

- **Role-based rules** — fire on any selection filling certain roles, regardless of which exact stacks:
  API Contract Consistency (any frontend + any backend), Data Layer Consistency (any backend + any
  database), No Direct Frontend-to-Database Access (any frontend + any database, with no backend between
  them), Deployment & Environment Consistency (any `tools`-role pick), and Full-Stack Change Propagation
  (frontend + backend + database all present).
- **Curated combo rules** — specific, common pairings that deserve named guidance: React + FastAPI,
  Next.js + SQL/Prisma, FastAPI + MongoDB, Node.js + MongoDB, Spring Boot + PostgreSQL, React + Tailwind
  CSS.

This lives in `src/lib/agent-hub/cross-stack.ts`, and `getCrossStackGuardrails(stacks)` returns the
matching rules for whatever combination is selected — an empty array for a single-stack pick, since there's
nothing to cross yet.

## Generation modes: Combined vs. Modular

Once more than one stack is selected, a mode toggle appears:

- **Combined (default, recommended)** — every selected stack is merged into one `.agent.md` (plus matching
  wrapped files per selected tool): one 10-directive header derived across the whole stack, a document
  section per role present (Frontend Rules, Backend Rules, Database Rules, …), the Cross-Stack Guardrails,
  then the Universal Guardrails and end-of-session reporting rule — each appearing exactly once. This is
  the file to reach for when you want a single agent that understands the whole repository, because a
  frontend change, a backend endpoint, and a database schema are all governed by the same file and the same
  cross-stack rules.
- **Modular** — each stack gets its own independent file per tool (e.g. a standalone `react-agent.md` next
  to a standalone `fastapi-agent.md`), so each stack's rules stay fully self-contained and can be read,
  toggled, or owned independently. For tools with a real per-stack file convention (GitHub Copilot, Claude
  Code, Cursor, Cline, Continue.dev), a shared root/anchor file (where the tool has one) carries the
  Cross-Stack + Universal Guardrails once, while each per-stack file still carries its own full directive
  set. For tools that only read one fixed root filename with no subfolder convention — Windsurf
  (`.windsurfrules`), Aider (`CONVENTIONS.md`), and `AGENTS.md` — true per-stack modularity isn't
  representable in that tool's own format, so Modular mode falls back to the same merged content Combined
  mode would produce, **for that target only**. This is a documented tool limitation, not a bug — see the
  `TargetShape` doc comment in `targets.ts`.

A single-stack selection collapses both modes to the same output, since there's nothing to combine or
modularize yet — the toggle is disabled until a second stack is added.

## What makes this different: the team layer

A static rules-file generator is a commodity — the actual Markdown content (best practices, directives,
anti-patterns) is copyable from any of a dozen "awesome-cursorrules"-style GitHub repos for free, and a
generic template has no way to know anything specific to how *your* team actually works. Four features
exist specifically to close that gap, and none of them require an account, a server, or a database:

- **Repo-aware stack detection** (`src/lib/agent-hub/detect.ts`, the "Detect your stack automatically"
  panel) — paste a real `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`,
  Gemfile, `.csproj`, or `pubspec.yaml` and Agent Hub reads your actual dependencies and pre-selects the
  matching stacks, additively, instead of you remembering and manually checking every one. It's the
  difference between a picker and a tool that actually looked at your repo.
- **Team-specific directive injection** (the "Make it yours" panel, rendered by
  `renderCustomRulesSection` in `templates/masterAgent.ts`) — free-text rules specific to how your team
  works ("always use our internal Logger, never `console.log`") are layered into the generated document
  exactly once, explicitly taking precedence over the generic guidance above them if the two ever conflict.
  This is what a static template can never do: it only knows what's true for everyone, never what's true
  for you.
- **A CI guardrail check that actually enforces itself** (`src/lib/agent-hub/ci-compliance.ts`, the
  "Add CI guardrail check" toggle) — an optional GitHub Actions workflow plus a dependency-free shell
  script that fails a pull request outright if it commits a `.env` file, a hard-coded secret-shaped string,
  or a silently-disabled lint/type rule — the same Never Allowed rules from the Operational Guardrails
  section, now checked automatically on every push instead of trusted to an agent's memory. A rules file an
  agent can ignore is a suggestion; a rules file with a CI job behind it is a standard.
- **A shareable team config link** (`src/lib/agent-hub/share-config.ts`) — every selection (stacks, mode,
  tools, custom rules, the CI toggle) is encoded into a single `?config=` URL param. A team lead configures
  the bundle once and pastes one link in Slack; anyone who opens it gets the byte-identical selection, with
  nothing to remember, misconfigure, or drift from — no login, no shared database, the state lives entirely
  in the URL.

Put together, these four are the actual pitch: not "here's a rules file," but "here's the layer that keeps
every engineer's AI agent — and every PR — enforcing the same standard, without anyone having to remember
what that standard was."

## How it's built (architecture)

Agent Hub is a fully client-side Next.js app. There is no database, no API route, no server-only package,
and no usage tracking — every byte of the generated bundle is computed in the visitor's browser from static
TypeScript data files.

```
Stack data (stacks.ts, role per stack) ─┐
Universal Guardrails                    │
(templates/universalGuardrails.ts)      ├─▶ buildMasterAgent(stack)          — one stack
Cross-Stack Guardrails (cross-stack.ts) │   buildCombinedMasterAgent(stacks) — N stacks, one merged body
Directive templates                     │   buildSharedIndexBody(stacks)    — shared-root content only
(templates/masterAgent.ts)             ─┘         │
                                                    ▼
                           AgentMeta { slug, label, tagline, fileGlobs }   (narrow view of a Stack
                                                    │                       or a synthetic combined agent)
                                                    ▼
                    buildTargetFiles / buildModularItemFile / buildSharedRootFile   (targets.ts)
                                                    │
                    wraps the SAME body into each tool's own file format/location —
                    a Cursor .mdc with frontmatter, a flat .windsurfrules, a CLAUDE.md
                    + subagent pair, etc. — using the target's TargetShape
                    (anchor+item / item-only / anchor-only) to decide whether a
                    multi-stack Modular selection gets a shared root file, per-stack
                    files only, or a merged fallback.
                                                    │
                                                    ▼
                    buildBundle(stackIds, targetIds, mode)     (generator.ts)
                    deduplicates by path, returns GeneratedFile[] for the UI + zip
                                                    │
                                                    ▼
                 TechSelector.tsx (multi-select stack picker)
                 + OutputPreview.tsx (mode toggle, tool picker, file
                 preview, buildBundleZip() dynamic `jszip` download)
                 wired together by AgentHub.tsx
```

Because the Master Agent body is generated from the same stack data regardless of how many stacks or
targets are selected, combining four stacks across five tools costs nothing extra in maintenance — there is
exactly one place (`stacks.ts` + `templates/masterAgent.ts`) that defines what "good FastAPI code" means,
one place (`cross-stack.ts`) that defines what changes when FastAPI sits next to MongoDB, and every tool's
file is a different wrapper around the same answer.

## Run it locally

Requirements: **Node.js 20+** (Node 22 recommended) and npm.

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (Turbopack, hot reload)
npm run dev

# 3. Open the app
#    http://localhost:3000        — the generator
#    http://localhost:3000/guides — the guides page
```

Other useful scripts:

```bash
npm run typecheck   # tsc --noEmit — no build, just type errors
npm run lint        # next lint
npm run build        # production build (see below)
npm start            # serve a production build (run `build` first)
```

There is nothing to configure to run it locally — no `.env` values are required for the app to function.
See [Environment variables](#environment-variables) for the one optional value that affects SEO metadata
only.

## Build it for production

```bash
npm install
npm run build   # outputs a standalone Next.js server build (see next.config.ts: output: "standalone")
npm start        # serves the build on port 3000 (set PORT to change it)
```

`next.config.ts` sets `output: "standalone"`, so `npm run build` produces a self-contained
`.next/standalone` directory with its own minimal `node_modules` — this is what the Docker image below
copies, and it's also what you'd copy to a bare VM if you weren't using a container.

## Deploy it

Agent Hub has no server-side state, no database and no secrets beyond an optional public site URL, so
it deploys anywhere that runs Node 20+ (or serves static files, via the export path below).

### Vercel (recommended)

The fastest path — `vercel.json` is already included.

```bash
npm install -g vercel   # if you don't have it
vercel                  # first deploy, follow the prompts
vercel --prod           # promote to production
```

Or, without the CLI: push this folder to its own GitHub repo and "Import Project" on
[vercel.com](https://vercel.com) — Vercel auto-detects Next.js and uses the settings in `vercel.json`
(`npm run build`, output directory `.next`). Set `NEXT_PUBLIC_SITE_URL` in the Vercel project's
Environment Variables to your production domain once you have one (see below) so canonical URLs and
JSON-LD resolve correctly.

### Docker

A multi-stage `Dockerfile` is included — non-root user, minimal final image, built on
`node:22-alpine`.

```bash
docker build -t agent-hub .
docker run -p 3000:3000 agent-hub
# → http://localhost:3000
```

To push it somewhere (a registry, a VPS, Fly.io, Render, Railway, AWS/GCP/Azure container services):

```bash
docker build -t <registry>/agent-hub:latest .
docker push <registry>/agent-hub:latest
# then run that image wherever your platform expects a container
```

### Any other Node host (Netlify, Render, Fly.io, a VPS)

The build is a standard Next.js `output: "standalone"` build, so any platform that runs
`npm install && npm run build && npm start` (or points at `.next/standalone/server.js` directly) works:

```bash
npm install
npm run build
node .next/standalone/server.js   # respects the PORT env var
```

For platforms that want a build command + start command in their dashboard (Render, Railway, etc.), use:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`

### Static export (no server needed) — the generator only, not `/admin`

The generator itself (everything under `/` and `/guides`) is fully static — no server components that
read request data, no dynamic routes, everything computed client-side. If you'd rather host *just the
generator* as plain static files (GitHub Pages, S3 + CloudFront, any static file host with no Node
runtime at all), you can switch to a static export:

1. In `next.config.ts`, change `output: "standalone"` to `output: "export"`.
2. Remove or ignore the `/admin` route and `proxy.ts` — a static export has no server to run either
   on, so the admin dashboard and usage tracking simply won't exist in that build.
3. Run `npm run build` — static HTML/CSS/JS lands in the `out/` directory.
4. Upload `out/` to your static host.

(This isn't the default because `output: "standalone"`/a normal Vercel/Node deploy gives you the `/admin`
dashboard and usage tracking below, and works identically on Vercel/Node hosts without a second config to
maintain — but the generator itself has zero server-only dependencies, so the export path always works if
all you want is the generator with no analytics at all.)

## Environment variables

Copy `.env.example` to `.env.local` for local overrides. Only the first is relevant to the generator
itself; the rest are entirely optional and only affect the `/admin` dashboard (see below).

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | No (defaults to `http://localhost:3000`) | Used to build canonical URLs, Open Graph/Twitter metadata and JSON-LD structured data. Set this to your real production domain once deployed. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | No — required only to open `/admin` | HTTP Basic Auth credentials for the admin dashboard, checked in `src/proxy.ts`. Pick your own values; without both set, `/admin` returns a 503 and the rest of the app is unaffected. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | Durable storage for `/admin`'s analytics. Without these, analytics still works via an in-memory fallback (fine for local dev, not for production — see [Admin dashboard & usage analytics](#admin-dashboard--usage-analytics)). |

The generator itself still needs no API key, database, or secret of any kind — everything above is opt-in
infrastructure for the site owner's own analytics, not for the generator to function.

## Admin dashboard & usage analytics

A password-protected `/admin` page shows the site owner (and only the site owner) how the app is actually
being used: total visits, visits per day, which stacks/tools/mode people actually pick when they generate a
bundle, and how many turn on the CI guardrail check. This is the one piece of server-side state in an
otherwise fully client-side app, and it's entirely opt-in — skip the setup below and the rest of the app
works exactly as it always has, with `/admin` simply returning a 503 that explains it isn't configured.

**What's tracked, and what isn't.** On every page view, `components/Analytics.tsx` sends a `path` and a
bare referrer *hostname* (never the full referrer URL, never an IP address, never a cookie or fingerprint)
to `/api/track`. On every successful bundle download, `OutputPreview.tsx` sends which stack ids, target
ids, generation mode, and CI-toggle state were used to `/api/track-bundle` — never the generated file
content, and never the free-text team-specific custom rules, since those could contain something specific
to the visitor's own repository.

**Setup:**

1. **Set login credentials.** Add `ADMIN_USER` and `ADMIN_PASSWORD` — locally in `.env.local`, or in your
   Vercel project's Settings → Environment Variables for production. Pick your own values; these are the
   credentials `src/proxy.ts` checks via HTTP Basic Auth before `/admin` ever renders.
2. **(Recommended for production) Add durable storage.** Without it, analytics uses an in-memory fallback
   that resets on every deploy/restart and isn't shared across serverless instances — fine to confirm the
   feature works locally, useless as real production analytics. Get a free Redis database either from the
   Vercel Marketplace (your project → Storage → Marketplace Database Providers → any Redis option) or
   directly at [upstash.com](https://upstash.com), then set `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` from it.
3. **Open `/admin`** on your deployed site (or `http://localhost:3000/admin` locally) and enter the
   credentials from step 1 when the browser's Basic Auth prompt appears.

There's exactly one admin account by design — see the doc comment in `src/proxy.ts` for why Basic
Auth is the right amount of complexity here, and what to reach for instead if you ever need more than one.

## Extending Agent Hub

### Add a new stack

Everything about a stack lives in two files. No component changes are needed — the UI renders whatever is
in `STACKS`.

1. **`src/lib/agent-hub/stacks.ts`** — add the new id to the `StackId` union, then add a `Stack` object to
   the `STACKS` array: `label`, `tagline`, `category` (one of the six `StackCategory` values), `role` (one
   of the five `StackRole` values — this is what places it in a combined-mode document section and lets it
   trigger role-based Cross-Stack Guardrails), `slug`, `emoji`, `practices` (5–6 bullets), `agentFocus`
   (2–3 bullets), `fileGlobs`, `antiPatterns` (2–3 bullets).
2. **`src/lib/agent-hub/templates/masterAgent.ts`** — add an entry for the new stack id to both the
   `TYPE_SAFETY` and `PERF` records (one sentence each, in that stack's own idiom).
3. **Optional — `src/lib/agent-hub/cross-stack.ts`** — if the new stack deserves named guidance next to a
   specific other stack (not just its role), add a `COMBO_RULES` entry with `requiresIds: [newId, otherId]`.

That's it — the stack now appears in the picker, under the category you chose, and produces a full bundle
across every existing target and every generation mode automatically.

### Add a new target (AI coding tool)

1. **`src/lib/agent-hub/targets.ts`** — add the new id to the `TargetId` union, add a `Target` object to
   the `TARGETS` array (`label`, `vendor`, `shape` — one of the three `TargetShape` values, decide whether
   the tool has a real per-stack file convention or just one fixed root file — `blurb`, `pathsPreview`,
   `howItsRead`, `setupSteps`, `docsUrl` — link the vendor's own docs, never a fabricated URL), and add a
   `case` to the `buildTargetFiles` switch statement that wraps the shared `agentBody` into that tool's
   real file format/location.
2. If `shape` is `"anchor+item"`, also add a branch to `buildModularItemFile` and `buildSharedRootFile` for
   the new target (mirroring the GitHub Copilot / Claude Code branches already there).
3. That's the whole change — the target picker, the zip generation, and the Guides page's per-tool
   section are all driven by the same `TARGETS` array, so a new entry appears everywhere automatically
   with no other file to touch.

## Project structure

```
agent-hub/
├── src/
│   ├── proxy.ts                   # Basic Auth gate for /admin (ADMIN_USER / ADMIN_PASSWORD)
│   ├── app/
│   │   ├── page.tsx              # Home page — the generator (stack + target picker, FAQ)
│   │   ├── guides/page.tsx        # Guides — what the files do, per-tool setup, how to write directives
│   │   ├── admin/page.tsx         # Password-protected usage analytics dashboard (server component)
│   │   ├── api/track/route.ts     # Records one page view (path + referrer hostname only)
│   │   ├── api/track-bundle/route.ts # Records one "bundle generated" event (stacks/mode/targets/CI toggle)
│   │   ├── layout.tsx             # Root layout, global metadata, theme-flash-free dark mode init, mounts <Analytics />
│   │   ├── globals.css            # Theme tokens (light/dark), component classes (.btn-*, .card, .pill)
│   │   ├── robots.ts / sitemap.ts # SEO
│   │   └── icon.svg
│   ├── components/
│   │   ├── AgentHub.tsx           # Orchestrator: persisted state (incl. custom rules, CI toggle), share-link read/write
│   │   ├── TechSelector.tsx       # Multi-select stack picker — categorized checkboxes + removable-tag summary
│   │   ├── ManifestDetector.tsx   # Paste a package.json/requirements.txt/etc. → auto-selects matching stacks
│   │   ├── OutputPreview.tsx      # Mode toggle, custom rules + CI toggle + share link, tool picker, preview, zip download
│   │   ├── Analytics.tsx          # Invisible: beacons one page-view event to /api/track per route change
│   │   ├── SiteHeader.tsx / SiteFooter.tsx / ThemeToggle.tsx / JsonLd.tsx
│   └── lib/
│       ├── agent-hub/
│       │   ├── stacks.ts          # Stack catalogue — practices, idioms, globs, anti-patterns, role per stack
│       │   ├── cross-stack.ts     # Role-based + curated combo rules → Cross-Stack Guardrails section
│       │   ├── detect.ts          # Manifest-text → matching StackId[] (repo-aware auto-detection)
│       │   ├── share-config.ts    # Encodes/decodes the full selection into a `?config=` URL for team sharing
│       │   ├── ci-compliance.ts   # Optional GitHub Actions workflow + guardrail-checking shell script
│       │   ├── targets.ts         # Tool catalogue — file formats/paths, TargetShape, setup guide per tool
│       │   ├── generator.ts       # Combines stacks + targets + mode + options into a deduplicated file list / zip
│       │   ├── types.ts           # Shared GeneratedFile type
│       │   └── templates/
│       │       ├── masterAgent.ts         # 10-directive template; single-stack and combined-agent builders
│       │       └── universalGuardrails.ts # Universal Guardrails + Mandatory End-of-Session Reporting text
│       ├── analytics/store.ts     # Upstash Redis (or in-memory fallback) reads/writes behind /admin
│       └── seo.ts                 # Metadata + JSON-LD helpers
├── public/
├── Dockerfile
├── vercel.json
├── next.config.ts
└── package.json
```

## Design principles

- **Deterministic, not "AI-powered."** No language model runs to produce output, and the app never claims
  otherwise — see the FAQ on the home page. What you get is exactly reproducible from the stack + target
  selection.
- **Nothing you generate leaves the browser.** Stack/target selection, bundle generation and the zip file
  are all built client-side; your last selection is persisted only in `localStorage`, on your device. The
  one deliberate exception is the opt-in `/admin` analytics above — anonymous, aggregate, and visible only
  to the site owner, never to a visitor, and the feature is entirely dormant until you configure it.
- **One master agent, many wrappers.** The content that defines "good code" for a stack is written once
  and reused across every tool — see [How it's built](#how-its-built-architecture).
- **No duplicated guardrails.** The Universal Guardrails, Cross-Stack Guardrails, and end-of-session
  reporting rule are injected exactly once per generated document, however many stacks it merges — never
  once per stack — see [Universal Guardrails](#universal-guardrails).
- **Honest about format limits.** A tool that only reads one fixed root file (Windsurf, Aider, AGENTS.md)
  is never made to pretend it supports per-stack modularity it can't represent — Modular mode falls back to
  the merged content for that target, documented as a tool limitation, not silently or incorrectly.
- **No dead weight.** Zero dependence on a database, auth, tracking, or any other app's code — this is a
  fully standalone project with its own isolated `package.json`.

## FAQ

See the home page's Questions section and the full [Guides page](#) for the complete FAQ, including "Is
this actually AI-powered?", "Is anything sent to a server?", and "Can I edit the generated files
afterward?" (short answer to all three: template-only/no/yes-please).

## License

This project is provided as-is for you to use, modify and deploy freely.
