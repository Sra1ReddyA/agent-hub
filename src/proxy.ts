import { NextRequest, NextResponse } from "next/server";

/**
 * Password-gates `/admin` with HTTP Basic Auth, checked against `ADMIN_USER` / `ADMIN_PASSWORD` — the
 * login credentials you define yourself as environment variables, never stored in the codebase or a
 * database. Runs on the Edge runtime, before the page itself ever renders, so an unauthenticated request
 * never even reaches the analytics data in `src/lib/analytics/store.ts`.
 *
 * This is intentionally simple (no session cookies, no user table, no third-party auth provider) because
 * there's exactly one admin — you — and Basic Auth over HTTPS (which Vercel terminates by default) is a
 * perfectly reasonable amount of security for a single-operator internal dashboard. If you ever need more
 * than one admin account or an audit log of who looked at what, that's the point to bring in a real auth
 * provider instead of extending this.
 */
export function proxy(req: NextRequest) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return new NextResponse(
      "The admin dashboard isn't configured yet. Set ADMIN_USER and ADMIN_PASSWORD as environment variables (locally in .env.local, or in your Vercel project's Settings → Environment Variables) and redeploy.",
      { status: 503, headers: { "Content-Type": "text/plain" } },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const separatorIndex = decoded.indexOf(":");
      const user = decoded.slice(0, separatorIndex);
      const pass = decoded.slice(separatorIndex + 1);
      if (user === expectedUser && pass === expectedPass) {
        return NextResponse.next();
      }
    } catch {
      // Malformed header — fall through to the 401 challenge below.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Agent Hub Admin", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
