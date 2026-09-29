/**
 * Free-tier repo cap for hosted (multi-tenant) installs — the one thing that needs to exist before "sell
 * this as a hosted product" means anything, since without a limit every install is effectively unlimited
 * free usage of your own Vercel/Redis/GitHub API quota. Deliberately not wired to real payment collection
 * yet (no Stripe checkout, no webhook-driven plan upgrades) — `Installation.plan` is set by whoever runs
 * this deployment (directly in Redis, or a future `/admin` control) until billing exists. Self-hosted
 * operators (their own App, their own deployment) can ignore this entirely by setting everyone to "pro".
 */

export type Plan = "free" | "pro";

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 3,
  pro: 50,
};

export const DEFAULT_PLAN: Plan = "free";

export function repoLimitForPlan(plan: Plan): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS[DEFAULT_PLAN];
}
