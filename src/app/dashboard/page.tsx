import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { TEMPLATE_CONTENT_VERSION } from "@/lib/agent-hub/version";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { OAUTH_CONFIGURED } from "@/lib/github-app/env";
import { getInstallation, type Installation } from "@/lib/github-app/installationStore";
import { repoLimitForPlan } from "@/lib/github-app/plan";
import { isRedisConfigured, listRepoConfigsForInstallation, type RepoConfig } from "@/lib/github-app/repoConfigStore";
import { signOut } from "./actions";
import { RepoConfigCard } from "./RepoConfigCard";

export const metadata: Metadata = { title: "Dashboard — Agent Hub Sync", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // per-visitor session state — never cache it

function SignInPrompt({ reason }: { reason?: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-[var(--color-ink)]">Your Agent Hub Sync dashboard</h1>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        {reason ?? "Sign in with the GitHub account you used to install Agent Hub Sync — you'll only ever see the repos your account actually has access to."}
      </p>
      <a href="/api/github/oauth/start" className="btn-primary mt-6 inline-flex">
        Sign in with GitHub →
      </a>
      <p className="mt-6 text-xs text-[var(--color-muted)]">
        Haven&apos;t installed it yet? Start at <Link href="/sync" className="underline underline-offset-2">/sync</Link>.
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  if (!OAUTH_CONFIGURED || !isRedisConfigured()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">Dashboard isn&apos;t available</h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          This deployment hasn&apos;t enabled the multi-tenant dashboard yet (missing GitHub OAuth credentials or Redis). If you&apos;re the operator, see the
          optional step on the App-creation page.
        </p>
      </div>
    );
  }

  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return <SignInPrompt />;

  const installations = (await Promise.all(session.installationIds.map((id) => getInstallation(id)))).filter((i): i is Installation => i !== null);

  if (installations.length === 0) {
    return <SignInPrompt reason="Signed in, but no Agent Hub Sync installation was found for your account yet — install it first, then come back here." />;
  }

  const reposByInstallation = new Map<number, RepoConfig[]>();
  await Promise.all(
    installations.map(async (i) => {
      reposByInstallation.set(i.installationId, await listRepoConfigsForInstallation(i.installationId));
    }),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-ink)]">Your dashboard</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Signed in as <span className="font-mono">{session.login}</span> — only your own installation(s) are shown.</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-sm text-[var(--color-accent)] underline underline-offset-2">
            Sign out
          </button>
        </form>
      </header>

      {installations.map((installation) => {
        const configs = (reposByInstallation.get(installation.installationId) ?? []).sort((a, b) => (b.lastSyncedAt ?? 0) - (a.lastSyncedAt ?? 0));
        const limit = repoLimitForPlan(installation.plan);
        const overLimit = installation.repoCount > installation.trackedRepoCount;
        const errorCount = configs.filter((c) => c.lastSyncStatus === "error").length;
        const staleCount = configs.filter((c) => c.lastSyncedContentVersion !== TEMPLATE_CONTENT_VERSION).length;

        return (
          <section key={installation.installationId} className="mb-12">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                {installation.accountLogin} <span className="text-sm font-normal text-[var(--color-muted)]">({installation.accountType.toLowerCase()})</span>
              </h2>
              <a
                href={`https://github.com/settings/installations/${installation.installationId}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--color-accent)] underline underline-offset-2"
              >
                Manage repos on GitHub ↗
              </a>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="card p-4">
                <div className="text-2xl font-bold text-[var(--color-ink)]">
                  {installation.trackedRepoCount}
                  <span className="text-sm font-normal text-[var(--color-muted)]"> / {limit}</span>
                </div>
                <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-muted)]">Repos synced ({installation.plan} plan)</div>
              </div>
              <div className="card p-4">
                <div className="text-2xl font-bold text-[var(--color-ink)]">{staleCount}</div>
                <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-muted)]">Behind current content version</div>
              </div>
              <div className="card p-4">
                <div className={`text-2xl font-bold ${errorCount > 0 ? "text-red-600" : "text-[var(--color-ink)]"}`}>{errorCount}</div>
                <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-muted)]">Last run errored</div>
              </div>
              <div className="card p-4">
                <div className="text-2xl font-bold text-[var(--color-ink)]">{installation.repoCount}</div>
                <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-muted)]">Repos granted access</div>
              </div>
            </div>

            {overLimit && (
              <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-3 text-sm text-[var(--color-ink)]">
                {installation.repoCount - installation.trackedRepoCount} repo(s) granted access aren&apos;t being synced — the {installation.plan} plan caps
                at {limit}. Remove access from one to free a slot, or ask about upgrading.
              </p>
            )}

            {configs.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--color-muted)]">No repos synced yet under this installation.</p>
            ) : (
              <div className="mt-6 space-y-4">
                {configs.map((c) => (
                  <RepoConfigCard key={`${c.installationId}::${c.repoFullName}`} config={c} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
