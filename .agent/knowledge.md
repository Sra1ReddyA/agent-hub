# Project Knowledge Base
> Agent memory. READ THIS FIRST on every task; UPDATE it before finishing. Keep under ~150 lines, terse.
> Never store secrets, tokens, or personal data. If an entry contradicts the code, trust the code and fix the entry.
> Seeded by Agent Hub from a scan of the repo: detected, not yet run. Confirm commands by running them, then refine.

## Commands (detected — confirm by running)
- install: `npm ci` _(package manager convention)_
- lint: `npm run lint` _(package.json scripts)_
- type-check: `npm run typecheck` _(package.json scripts)_
- test: `npm test` _(package.json scripts)_
- build: `npm run build` _(package.json scripts)_
- run / dev: `npm run dev` _(package.json scripts)_

## Map (path -> purpose)
- `src/` — application source (72 files)
- `tests/` — tests (5 files)
- `cli/` — command-line tool (4 files)
- `.github/` (2 files)
- `scripts/` — dev / build scripts (1 files)
- `src/lib/` — shared library code (34 files)
- `src/app/` — app routes / entrypoints (27 files)
- `src/components/` — UI components (10 files)

## Conventions & decisions (why, not just what)
- Stack: Node.js, Docker / K8s, React, Next.js, TypeScript, Tailwind CSS
- TypeScript strict mode is on — no implicit any
- Import alias `@/*` → `./src/*`

## Pitfalls / gotchas (what broke before, and the fix)

## Open items / next steps
