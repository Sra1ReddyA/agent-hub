import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ManifestConversion = {
  id: number;
  slug: string;
  pem: string;
  webhook_secret: string;
  html_url: string;
  name: string;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Step 2 of the GitHub App Manifest flow (see `../route.ts`) — GitHub redirects here with a one-time
 * `code` after the person confirms creating the App. Exchanging it (no auth required for this specific
 * endpoint — the code itself is the credential, and it's single-use and short-lived) is the only way to
 * get back the App's private key and webhook secret, and GitHub does not show them again afterward. This
 * route never stores them: it renders them once, in the response, with instructions to paste them into
 * Vercel's environment variables and redeploy. If this page is lost before that's done, delete the
 * half-created App on GitHub and run the manifest flow again — it costs nothing to redo.
 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return new NextResponse("Missing ?code from GitHub.", { status: 400 });
  }

  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!res.ok) {
    const body = await res.text();
    return new NextResponse(`GitHub rejected the manifest conversion (this code is single-use and expires quickly — restart at /sync if it's gone stale):\n\n${body}`, {
      status: 502,
    });
  }

  const app = (await res.json()) as ManifestConversion;
  const installUrl = `${app.html_url}/installations/new`;
  // Vercel's env-var UI collapses real newlines, so the copy-paste value uses literal "\n" — env.ts
  // reverses this (`.replace(/\\n/g, "\n")`) before handing the key to the JWT/auth library.
  const pemForEnvVar = app.pem.replace(/\n/g, "\\n");

  const html = `<!doctype html>
<html><head><meta charSet="utf-8" /><title>Agent Hub Sync — App created</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 16px; line-height: 1.5; color: #1a1a1a; }
  code, pre { background: #f4f4f5; border-radius: 6px; padding: 2px 6px; font-family: ui-monospace, monospace; font-size: 13px; }
  pre { padding: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  .warn { background: #fff8e1; border: 1px solid #f0c14b; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  h2 { margin-top: 28px; }
  a.btn { display: inline-block; margin-top: 12px; padding: 10px 18px; background: #24292f; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
</style></head>
<body>
  <h1>✅ "${escapeHtml(app.name)}" was created</h1>
  <div class="warn"><strong>GitHub will not show the private key or webhook secret again after this page.</strong> Copy everything below into your deployment's environment variables now.</div>

  <h2>1. Set these environment variables</h2>
  <p>In Vercel: your project → Settings → Environment Variables. Then redeploy — env var changes don't apply to a build that already ran.</p>
  <pre>GITHUB_APP_ID=${escapeHtml(String(app.id))}
GITHUB_APP_SLUG=${escapeHtml(app.slug)}
GITHUB_APP_WEBHOOK_SECRET=${escapeHtml(app.webhook_secret)}
GITHUB_APP_PRIVATE_KEY=${escapeHtml(pemForEnvVar)}</pre>
  <p>Also set <code>CRON_SECRET</code> to any random string of your choosing (used to authenticate the daily resync job — see <code>vercel.json</code>), and make sure <code>UPSTASH_REDIS_REST_URL</code>/<code>UPSTASH_REDIS_REST_TOKEN</code> are set — Agent Hub Sync needs durable storage, there's no in-memory fallback for it like there is for <code>/admin</code>.</p>

  <h2>2. Install it on your repos</h2>
  <p>Once the env vars above are live (i.e. after your next deploy), install the App itself:</p>
  <a class="btn" href="${installUrl}" target="_blank" rel="noopener noreferrer">Install ${escapeHtml(app.name)} on GitHub →</a>
  <p>Pick the repositories you want kept in sync. Agent Hub Sync opens its first pull request within moments of being installed on a repo — no other setup required; it starts from a zero-config default (auto-detected stacks, Combined mode, GitHub Copilot + Claude Code + Cursor) and you can just edit the opened PR directly if you want something different.</p>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
