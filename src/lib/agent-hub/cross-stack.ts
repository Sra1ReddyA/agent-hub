import type { Stack, StackId, StackRole } from "./stacks";

/**
 * Cross-stack relationship rules — the guidance that only makes sense once you know what ELSE is in the
 * stack. A single-stack FastAPI agent has no reason to mention CORS-vs-frontend-origin; a FastAPI+React
 * agent does. Each rule fires by role-combination (generic, scales to any stack added later) or by an
 * exact stack-id combination (curated, for the handful of pairings worth naming specifically).
 */
export type CrossStackRule = {
  id: string;
  title: string;
  /** Role-based trigger: fires whenever every listed role is present in the selection. Use this for
   * guidance that holds regardless of which specific stack fills each role. */
  requiresRoles?: StackRole[];
  /** Stack-id trigger: fires only when every listed id is present — for guidance specific enough that a
   * generic role rule would either be wrong or miss the interesting detail. */
  requiresIds?: StackId[];
  guidance: string[];
};

const RULES: CrossStackRule[] = [
  {
    id: "frontend-backend-contract",
    title: "API Contract Consistency (Frontend ↔ Backend)",
    requiresRoles: ["frontend", "backend"],
    guidance: [
      "Treat the request/response shape as a contract shared by both sides — when a backend endpoint's response shape changes, update every frontend consumer of it in the same change, not as a follow-up.",
      "Keep error response shapes consistent across every endpoint the frontend calls, so the frontend can handle failures with one code path instead of one per endpoint.",
      "Configure CORS narrowly to the frontend's real origin(s) — never a wildcard `*` alongside credentials/cookies.",
      "When the frontend adds client-side validation, mirror the same rule server-side — client validation is UX, server validation is the actual guardrail.",
    ],
  },
  {
    id: "backend-database-consistency",
    title: "Data Layer Consistency (Backend ↔ Database)",
    requiresRoles: ["backend", "database"],
    guidance: [
      "When a backend model's fields change, the database schema/migration and every query that reads or writes that shape change in the same pass — never let the model and the schema drift.",
      "Wrap multi-step writes that touch more than one table/collection in a transaction (or the closest equivalent the database supports) so the backend never leaves data in a half-written state.",
      "Route database credentials through environment/secret configuration the backend already uses — never a second, separately-hardcoded connection string.",
      "Size the connection pool to the backend's actual concurrency model (thread pool, event loop, worker count) — a pool that's too small serializes requests that should run concurrently; one too large can exhaust the database's own connection limit.",
    ],
  },
  {
    id: "frontend-database-no-direct-access",
    title: "No Direct Frontend-to-Database Access",
    requiresRoles: ["frontend", "database"],
    guidance: [
      "A frontend framework and a database being selected together does not mean the frontend should talk to the database directly — route all data access through the backend's API layer (or a serverless/edge function if there's no dedicated backend stack selected), so validation, auth and business rules stay enforced in one place.",
      "If this repository genuinely uses a client SDK with its own server-side security rules (e.g. a managed backend-as-a-service), treat those security rules with the same rigor as an API layer — they are the actual access-control boundary, not a convenience to skip past.",
    ],
  },
  {
    id: "deployment-consistency",
    title: "Deployment & Environment Consistency",
    requiresRoles: ["tools"],
    guidance: [
      "Keep dev/staging/production environment parity — the same containerization, the same environment-variable names, the same versions of anything pinned — so a bug can't hide behind an environment difference.",
      "Secrets flow through the deployment/orchestration layer's secret store (not baked into an image, not committed in a manifest) for every other stack in this repository, not just the ones this tooling was originally set up for.",
      "When adding a new service or dependency to the app, update the deployment configuration in the same change — a Dockerfile, compose file or manifest that silently drifts from what the app actually needs is a production incident waiting to happen.",
    ],
  },
  {
    id: "fullstack-change-propagation",
    title: "Full-Stack Change Propagation",
    requiresRoles: ["frontend", "backend", "database"],
    guidance: [
      "A schema change propagates in one direction, always: database migration → backend model/query update → backend response shape → frontend type/consumer update. Trace a change all the way through before calling it done.",
      "Before removing or renaming a field anywhere in this chain, grep for every consumer across all three layers — a rename that looks complete in the backend can silently break a frontend that was never updated.",
      "When something breaks, localize it to a layer before proposing a fix: is this a database constraint, a backend validation gap, or a frontend state bug? Fixing the wrong layer hides the real defect.",
    ],
  },
];

/** Curated, stack-specific pairings worth naming beyond the generic role rules above. */
const COMBO_RULES: CrossStackRule[] = [
  {
    id: "react-fastapi",
    title: "React + FastAPI",
    requiresIds: ["react", "fastapi"],
    guidance: [
      "Keep TypeScript request/response types in the React app in sync with the Pydantic models FastAPI actually returns — regenerate or hand-update them together, and treat FastAPI's auto-generated OpenAPI schema as the source of truth if the project has tooling that can generate a TS client from it.",
    ],
  },
  {
    id: "nextjs-sql-prisma",
    title: "Next.js + SQL/Prisma",
    requiresIds: ["nextjs", "sql-prisma"],
    guidance: [
      "Query the database from Server Components or Server Actions, not from a client-side `useEffect` calling an extra API route that just wraps Prisma — Next.js already gives you a server context to query from directly.",
    ],
  },
  {
    id: "fastapi-mongodb",
    title: "FastAPI + MongoDB",
    requiresIds: ["fastapi", "mongodb"],
    guidance: [
      "Use an async MongoDB driver (Motor) to match FastAPI's async handlers — a synchronous PyMongo call inside `async def` blocks the event loop exactly like any other blocking I/O.",
      "Validate documents with the same Pydantic models used for the API's request/response bodies where the shapes overlap, instead of maintaining two separate schemas that can drift.",
    ],
  },
  {
    id: "nodejs-mongodb",
    title: "Node.js + MongoDB",
    requiresIds: ["nodejs", "mongodb"],
    guidance: [
      "If using Mongoose, let its schema validation be the enforcement point for document shape — don't also hand-roll a second, looser validation pass that can disagree with it.",
    ],
  },
  {
    id: "spring-postgresql",
    title: "Spring Boot + PostgreSQL",
    requiresIds: ["spring-boot", "postgresql"],
    guidance: [
      "Manage schema changes with a migration tool (Flyway/Liquibase) rather than Hibernate's `ddl-auto: update` in anything beyond local development — auto-schema-update in production is a data-loss risk.",
    ],
  },
  {
    id: "react-tailwind",
    title: "React + Tailwind CSS",
    requiresIds: ["react", "tailwind"],
    guidance: [
      "When a utility-class string starts repeating across components, extract a React component before reaching for `@apply` — a shared component keeps markup and styling in sync in one place.",
    ],
  },
];

/** Returns every cross-stack guardrail block that applies to this exact selection, generic role rules
 * first (broadest applicability) followed by curated combo rules (most specific). Returns an empty array
 * for a single-stack selection — there is nothing cross-stack to say about one stack alone. */
export function getCrossStackGuardrails(stacks: Stack[]): CrossStackRule[] {
  if (stacks.length < 2) return [];
  const ids = new Set(stacks.map((s) => s.id));
  const roles = new Set(stacks.map((s) => s.role));

  const roleMatches = RULES.filter((r) => r.requiresRoles?.every((role) => roles.has(role)));
  const comboMatches = COMBO_RULES.filter((r) => r.requiresIds?.every((id) => ids.has(id)));
  return [...roleMatches, ...comboMatches];
}
