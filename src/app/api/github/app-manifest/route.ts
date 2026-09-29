import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";

/**
 * Step 1 of the GitHub App Manifest flow — the low-friction way to create a GitHub App without a human
 * filling in 20+ form fields by hand. This route returns a tiny self-submitting HTML form that POSTs a
 * pre-filled manifest to GitHub; GitHub shows a one-screen confirmation, creates the App on submit, and
 * redirects back to `/api/github/app-manifest/callback` with a `code` that route exchanges for the App's
 * real credentials. See https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest.
 *
 * `org` is optional — pass `?org=your-org-name` to register the App under a GitHub organization instead of
 * the signed-in user's personal account (useful when the repos to sync live under an org).
 *
 * Two things GitHub enforces that are easy to get wrong here:
 * 1. The webhook URL has to be reachable from the public internet — GitHub validates it synchronously
 *    against the manifest before creating the App, so this route refuses to run at all against a
 *    `localhost`/private `SITE_URL` instead of sending the visitor to GitHub only to hit a confusing
 *    "Hook url is not supported" error there. Run this from your deployed production URL.
 * 2. `installation` and `installation_repositories` are NOT selectable webhook events in a manifest (or
 *    in the App's settings UI) — GitHub sends them automatically to every App with any repository access,
 *    with no opt-in required and no permission tied to them. Listing them in `default_events` is what
 *    produced "Default events unsupported" / "not supported by permissions" — the fix is to just not list
 *    them; `src/app/api/github/webhook/route.ts` still handles them the moment the App is created.
 */
export async function GET(req: Request) {
  const org = new URL(req.url).searchParams.get("org");

  const siteHost = new URL(SITE_URL).hostname;
  const isLocal = siteHost === "localhost" || siteHost === "127.0.0.1" || siteHost.endsWith(".local");
  if (isLocal) {
    return new NextResponse(
      `GitHub needs a publicly reachable URL for the webhook, and NEXT_PUBLIC_SITE_URL is currently "${SITE_URL}".\n\n` +
        `Deploy this project first (see the README's Deploy section), set NEXT_PUBLIC_SITE_URL to that real ` +
        `domain, redeploy, then open this same "/sync" → "Create your GitHub App" flow from the deployed site ` +
        `— not from localhost. If you're testing locally, a tunnel (ngrok/Cloudflare Tunnel) exposing this dev ` +
        `server would also give GitHub a reachable URL, but a real deploy is the normal path.`,
      { status: 400, headers: { "Content-Type": "text/plain" } },
    );
  }

  const manifest = {
    name: `Agent Hub Sync (${siteHost})`,
    url: SITE_URL,
    hook_attributes: { url: `${SITE_URL}/api/github/webhook` },
    redirect_url: `${SITE_URL}/api/github/app-manifest/callback`,
    public: false,
    // Only list events that are actually opt-in and tied to a permission above. `installation` and
    // `installation_repositories` arrive automatically regardless of what's listed here — see the doc
    // comment above.
    default_events: ["push"],
    default_permissions: {
      contents: "write",
      pull_requests: "write",
      metadata: "read",
      // GitHub gates writes to .github/workflows/* behind this permission specifically — `contents: write`
      // alone gets a 403 "Resource not accessible by integration" the moment a tree containing a workflow
      // path is created. Needed because the optional "Include CI enforcement check" option (repoConfigStore
      // .includeCiCheck) generates .github/workflows/agent-guardrails.yml — see ci-compliance.ts.
      workflows: "write",
    },
  };

  const targetUrl = org ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new` : "https://github.com/settings/apps/new";

  const html = `<!doctype html>
<html><head><meta charSet="utf-8" /><title>Creating your Agent Hub Sync App…</title></head>
<body>
  <p>Redirecting to GitHub to create your GitHub App…</p>
  <form id="f" action="${targetUrl}" method="post">
    <input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}' />
  </form>
  <script>document.getElementById('f').submit();</script>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
