import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, GITHUB_APP_ID, OAUTH_CONFIGURED } from "@/lib/github-app/env";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";

const STATE_COOKIE = "ah_oauth_state";

type GitHubUser = { id: number; login: string };
type UserInstallation = { id: number; app_id: number; account: { login: string; type: string } | null };
type UserInstallationsResponse = { total_count: number; installations: UserInstallation[] };

/**
 * Step 2 — GitHub redirects here with `code` (and the `state` we set in oauth/start) after the person
 * approves the "Sign in with GitHub" screen. Exchanges the code for a user access token, asks GitHub who
 * that is and which installations of THIS App they can administer, then issues a session scoped to exactly
 * those installation ids.
 *
 * Deliberately asks GitHub live (`GET /user/installations`) rather than trusting our own
 * `installationStore`'s reverse index for authorization: GitHub's answer already accounts for org
 * membership and admin permissions correctly and can't go stale the way a locally-maintained index could —
 * this route is the one place that actually needs "which installations can this specific person touch,
 * right now," so it asks the source of truth directly instead of re-deriving it.
 */
export async function GET(req: NextRequest) {
  if (!OAUTH_CONFIGURED) {
    return new NextResponse("The multi-tenant dashboard isn't configured on this deployment.", { status: 503 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return new NextResponse("OAuth state mismatch or missing code — this login link may have expired. Start over from /dashboard.", { status: 400 });
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: GITHUB_APP_CLIENT_ID,
      client_secret: GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: `${SITE_URL}/api/github/oauth/callback`,
    }),
  });
  if (!tokenRes.ok) {
    return new NextResponse(`GitHub rejected the token exchange: ${await tokenRes.text()}`, { status: 502 });
  }
  const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenBody.access_token) {
    return new NextResponse(`GitHub didn't return an access token: ${tokenBody.error_description ?? tokenBody.error ?? "unknown error"}`, { status: 502 });
  }
  const accessToken = tokenBody.access_token;

  const [userRes, installationsRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" } }),
    fetch("https://api.github.com/user/installations", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" } }),
  ]);
  if (!userRes.ok || !installationsRes.ok) {
    return new NextResponse("Couldn't read your GitHub identity or installations after login — try again.", { status: 502 });
  }
  const user = (await userRes.json()) as GitHubUser;
  const installationsBody = (await installationsRes.json()) as UserInstallationsResponse;

  const appId = Number(GITHUB_APP_ID);
  const installationIds = installationsBody.installations.filter((i) => i.app_id === appId).map((i) => i.id);

  if (installationIds.length === 0) {
    const res = NextResponse.redirect(`${SITE_URL}/sync#troubleshooting`);
    res.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }

  const token = await createSessionToken({ uid: user.id, login: user.login, installationIds });
  const res = NextResponse.redirect(`${SITE_URL}/dashboard`);
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60, path: "/" });
  res.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
