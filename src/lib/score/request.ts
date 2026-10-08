/** Best-effort client IP for rate limiting. On Vercel `x-forwarded-for` is set by the platform edge; elsewhere it
 * may be client-supplied, which at worst lets a caller dodge their own per-IP limit — the global budget in
 * `service.ts` still bounds total GitHub usage. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64).replace(/[^0-9a-fA-F:.]/g, "") || "unknown";
}
