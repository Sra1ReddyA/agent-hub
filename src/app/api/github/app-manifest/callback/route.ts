import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";

type ManifestConversion = {
  id: number;
  slug: string;
  pem: string;
  webhook_secret: string;
  html_url: string;
  name: string;
  client_id: string;
  client_secret: string;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON for embedding inside an inline `<script>` block — escapes `<` so a credential value that happened
 * to contain the literal sequence `</script` (implausible for these specific values, but cheap to rule
 * out entirely) can't break out of the script tag early. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
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

  // Read directly rather than importing from env.ts's GITHUB_APP_* exports: this request's process.env
  // is a snapshot from BEFORE the four vars below exist (they're only being handed to the person now, to
  // paste in themselves), so env.ts's GITHUB_APP_CONFIGURED would always read false here regardless of
  // Redis/cron state — checking Redis and CRON_SECRET directly avoids conflating "the App doesn't exist
  // yet" (true, on this exact page load) with "Redis isn't configured" (the thing actually worth flagging).
  const redisConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const cronConfigured = Boolean(process.env.CRON_SECRET);

  // A fresh random value for the /dashboard session-signing secret — no reason to make the person generate
  // their own when a cryptographically random one is one line away; it's independent of anything GitHub
  // returned, so this is just a convenience, not something that needs to match anything server-side yet.
  const sessionSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const envVars: { key: string; value: string }[] = [
    { key: "GITHUB_APP_ID", value: String(app.id) },
    { key: "GITHUB_APP_SLUG", value: app.slug },
    { key: "GITHUB_APP_WEBHOOK_SECRET", value: app.webhook_secret },
    { key: "GITHUB_APP_PRIVATE_KEY", value: pemForEnvVar },
  ];
  // Only needed to run the multi-tenant `/dashboard` (GitHub OAuth login, scoped to this App) — a
  // self-hosted single-operator setup can skip these three and stick with /admin's Basic Auth.
  const oauthEnvVars: { key: string; value: string }[] = [
    { key: "GITHUB_APP_CLIENT_ID", value: app.client_id },
    { key: "GITHUB_APP_CLIENT_SECRET", value: app.client_secret },
    { key: "SESSION_SECRET", value: sessionSecret },
  ];
  const envBlock = envVars.map((v) => `${v.key}=${v.value}`).join("\n");
  const oauthEnvBlock = oauthEnvVars.map((v) => `${v.key}=${v.value}`).join("\n");
  const allVars = [...envVars, ...oauthEnvVars]; // one shared index space so copyVar(i) below works for either group

  const rowsFor = (vars: { key: string; value: string }[], startIndex: number) =>
    vars
      .map(
        (v, j) => `<div class="row">
      <code class="rowkey">${escapeHtml(v.key)}</code>
      <button class="copybtn" onclick="copyVar(${startIndex + j}, this)">Copy</button>
    </div>
    <pre id="val-${startIndex + j}" class="value">${escapeHtml(v.value)}</pre>`,
      )
      .join("\n");

  const rows = rowsFor(envVars, 0);
  const oauthRows = rowsFor(oauthEnvVars, envVars.length);

  const html = `<!doctype html>
<html><head><meta charSet="utf-8" /><title>Agent Hub Sync — App created</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 16px; line-height: 1.5; color: #1a1a1a; }
  code, pre { background: #f4f4f5; border-radius: 6px; padding: 2px 6px; font-family: ui-monospace, monospace; font-size: 13px; }
  pre.value { padding: 10px 12px; margin: 4px 0 14px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  .warn { background: #fff8e1; border: 1px solid #f0c14b; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  .blocker { background: #fdecea; border: 1px solid #e57373; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  .ok { background: #e8f5e9; border: 1px solid #81c784; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  h2 { margin-top: 28px; }
  .stepnum { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 999px; background: #24292f; color: #fff; font-size: 12px; font-weight: 700; margin-right: 6px; }
  a.btn, button.btn { display: inline-block; margin-top: 12px; padding: 10px 18px; background: #24292f; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; border: none; cursor: pointer; font-size: 14px; }
  a.btn.disabled { background: #9aa0a6; pointer-events: none; }
  .row { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
  .rowkey { font-weight: 600; }
  button.copybtn { padding: 4px 10px; font-size: 12px; border-radius: 6px; border: 1px solid #d0d7de; background: #fff; cursor: pointer; }
  button.copybtn:hover { background: #f4f4f5; }
  pre.value { margin-top: 4px; }
</style></head>
<body>
  <h1>✅ "${escapeHtml(app.name)}" was created</h1>
  <div class="warn"><strong>GitHub will not show the private key or webhook secret again after this page.</strong> Do steps 1–3 below now, in order, before navigating away.</div>

  <h2><span class="stepnum">1</span>Set these four environment variables</h2>
  <p>In Vercel: your project → Settings → Environment Variables. Add each one below (use the per-line "Copy" buttons — <strong>don't</strong> paste all four as one value into a single field).</p>
  ${rows}
  <button class="copybtn" onclick="copyAll(this)">Copy all four as .env text</button>
  <p style="font-size: 13px; color: #57606a;">("Copy all" is for Vercel's bulk-paste .env box in project settings, if you're using that instead of adding rows one at a time — either works.)</p>

  <h2><span class="stepnum">1b</span>Optional — enable the multi-tenant dashboard</h2>
  <p>Only needed if you're running this as a <strong>hosted</strong> instance other people install into their own repos (rather than a self-hosted one just for you). It adds a GitHub-login-gated <code>/dashboard</code> where each installer sees and edits only their own repos — separate from your own <code>/admin</code>, which is Basic-Auth-protected and sees everything. Skip this block entirely for a self-hosted, single-operator setup.</p>
  ${oauthRows}
  <button class="copybtn" onclick="copyAllOauth(this)">Copy all three as .env text</button>
  <p style="font-size: 13px; color: #57606a;">The App you just created already has its OAuth callback URL and "Request user authorization during installation" set — nothing more to do there. (If you're instead adding this to an App you created before this option existed: its General settings page needs <strong>"Callback URL"</strong> set to <code>${escapeHtml(SITE_URL)}/api/github/oauth/callback</code> and <strong>"Request user authorization (OAuth) during installation"</strong> checked.)</p>

  <h2><span class="stepnum">2</span>Confirm the other two required variables</h2>
  <p>Agent Hub Sync needs durable storage — there's no in-memory fallback for it like there is for <code>/admin</code>'s analytics. Without Redis, installs will succeed and look fine, but every sync will silently do nothing.</p>
  <div class="${redisConfigured ? "ok" : "blocker"}">
    ${redisConfigured ? "✅" : "❌"} <code>UPSTASH_REDIS_REST_URL</code> / <code>UPSTASH_REDIS_REST_TOKEN</code>
    ${redisConfigured ? "— already set on this deployment." : "— not set yet. Required. Add a free Redis database (Vercel Marketplace or upstash.com), then set both."}
  </div>
  <div class="${cronConfigured ? "ok" : "warn"}">
    ${cronConfigured ? "✅" : "⚠️"} <code>CRON_SECRET</code>
    ${cronConfigured ? "— already set." : "— not set yet. Optional but recommended: set it to any random string so the daily resync job (see <code>vercel.json</code>) is authenticated."}
  </div>

  <h2><span class="stepnum">3</span>Redeploy</h2>
  <p>Environment variable changes don't apply to a build that already ran — trigger a new deployment now (Vercel: Deployments tab → ⋯ on the latest → Redeploy, or push any commit).</p>

  <h2><span class="stepnum">4</span>Install it on your repos</h2>
  <p><strong>Wait for the redeploy in step 3 to finish first</strong> — installing before that just means the first webhook delivery hits the old build and gets a 503.</p>
  <a class="btn" href="${installUrl}" target="_blank" rel="noopener noreferrer">Install ${escapeHtml(app.name)} on GitHub →</a>
  <p>Pick the repositories you want kept in sync. Agent Hub Sync opens its first pull request within moments — no other setup required; it starts from a zero-config default (auto-detected stacks, Combined mode, GitHub Copilot + Claude Code + Cursor) and you can edit the opened PR directly, or edit the config from <code>/admin/sync</code>, if you want something different.</p>

  <h2><span class="stepnum">5</span>Verify it actually worked</h2>
  <p>After installing, check <a href="/admin/sync">/admin/sync</a> (behind your admin login) — the repo should show up there with a status within moments. If it doesn't, or shows an error, see the <a href="/sync">Troubleshooting section on /sync</a>.</p>

  <script>
    const values = ${jsonForScript(allVars.map((v) => v.value))};
    const envBlock = ${jsonForScript(envBlock)};
    const oauthEnvBlock = ${jsonForScript(oauthEnvBlock)};
    function flash(btn) {
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = original; }, 1200);
    }
    function copyVar(i, btn) {
      navigator.clipboard.writeText(values[i]).then(() => flash(btn));
    }
    function copyAllOauth(btn) {
      navigator.clipboard.writeText(oauthEnvBlock).then(() => flash(btn));
    }
    function copyAll(btn) {
      navigator.clipboard.writeText(envBlock).then(() => flash(btn));
    }
  </script>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
