import { NextResponse } from "next/server";
import { GITHUB_APP_CLIENT_ID, OAUTH_CONFIGURED } from "@/lib/github-app/env";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";

const STATE_COOKIE = "ah_oauth_state";

/**
 * Step 1 of "Sign in with GitHub" for `/dashboard` — redirects to GitHub's OAuth authorize screen, scoped
 * to this exact App (its `client_id`), not a generic GitHub login. The `state` value is CSRF protection:
 * without it, a third party could send a victim's browser through a login flow using an attacker-supplied
 * `code`, silently linking the victim's session to the attacker's GitHub identity. It's a short-lived
 * httpOnly cookie rather than anything signed — a random unguessable value the callback compares byte-for-
 * byte is enough; there's no other state worth carrying here.
 */
export async function GET() {
  if (!OAUTH_CONFIGURED) {
    return new NextResponse(
      "The multi-tenant dashboard isn't configured on this deployment (GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET missing) — see the optional step on the App-creation page, or use /admin if you're the operator of a self-hosted instance.",
      { status: 503, headers: { "Content-Type": "text/plain" } },
    );
  }

  const state = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", GITHUB_APP_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", `${SITE_URL}/api/github/oauth/callback`);
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
