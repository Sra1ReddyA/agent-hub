import { App } from "@octokit/app";
import { GITHUB_APP_CONFIGURED, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_WEBHOOK_SECRET } from "./env";

/**
 * One `@octokit/app` instance for the whole server process, lazily constructed only when the three
 * required env vars are present — constructing it eagerly would throw at import time in every session
 * that hasn't set up the GitHub App yet (the overwhelming majority of visitors, at least at first), which
 * would take down the whole app rather than just the opt-in sync feature.
 */
let app: App | null = null;

export function getApp(): App {
  if (!GITHUB_APP_CONFIGURED) {
    throw new Error("GitHub App isn't configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_APP_WEBHOOK_SECRET missing).");
  }
  if (!app) {
    app = new App({
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_APP_PRIVATE_KEY,
      webhooks: { secret: GITHUB_APP_WEBHOOK_SECRET },
    });
  }
  return app;
}

/** An Octokit client authenticated as one specific installation (i.e. scoped to the repos that
 * installation was granted access to) — this is what every read/write against a tracked repo uses. */
export async function getInstallationOctokit(installationId: number) {
  return getApp().getInstallationOctokit(installationId);
}
