/**
 * Config for "Agent Hub Sync" — the GitHub App that watches a repo and opens a PR when either (a) its
 * dependencies changed enough that the detected stack combination changed, or (b) Agent Hub's own
 * guardrail content moved to a new `TEMPLATE_CONTENT_VERSION` — so the generated file stays current
 * without anyone remembering to come back to the site. See `src/lib/github-app/sync.ts` for the actual
 * logic and `/sync` for the human-facing setup flow.
 *
 * Entirely opt-in, exactly like the /admin analytics: with none of these set, every route under
 * `/api/github/*` and `/api/cron/*` just 503s and the rest of the app is unaffected.
 */

export const GITHUB_APP_ID = process.env.GITHUB_APP_ID ?? "";
// Stored with literal "\n" sequences in most env-var UIs (Vercel included) since a real PEM has embedded
// newlines that env var inputs mangle — normalize back to real newlines before handing it to the JWT/auth
// library, which requires them.
export const GITHUB_APP_PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
export const GITHUB_APP_WEBHOOK_SECRET = process.env.GITHUB_APP_WEBHOOK_SECRET ?? "";
export const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG ?? "";
export const CRON_SECRET = process.env.CRON_SECRET ?? "";

// Only needed for the multi-tenant `/dashboard` (GitHub's OAuth "Sign in" flow, scoped to this exact App)
// — the self-hosted single-operator path (`/admin`, Basic Auth) never touches these. Both come from the
// same manifest-conversion response as the four vars above; see app-manifest/callback/route.ts.
export const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID ?? "";
export const GITHUB_APP_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET ?? "";
export const OAUTH_CONFIGURED = Boolean(GITHUB_APP_CLIENT_ID && GITHUB_APP_CLIENT_SECRET);

// Signs the `/dashboard` session cookie (see src/lib/auth/session.ts). Any random string — generate one
// with `openssl rand -hex 32` or similar. Without it, /dashboard refuses to issue sessions rather than
// sign them with a guessable default.
export const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

export const GITHUB_APP_CONFIGURED = Boolean(GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY && GITHUB_APP_WEBHOOK_SECRET);

export const GITHUB_APP_INSTALL_URL = GITHUB_APP_SLUG ? `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new` : null;

/** The name commits/PRs from the sync bot are attributed to — `<slug>[bot]` is how GitHub itself labels
 * every GitHub App's commits, so this also doubles as the check that stops the bot reacting to its own
 * pushes (see the `push` handler in `webhook/route.ts`). */
export const BOT_LOGIN = GITHUB_APP_SLUG ? `${GITHUB_APP_SLUG}[bot]` : null;
