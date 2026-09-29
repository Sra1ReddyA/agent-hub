import type { Metadata } from "next";
import Link from "next/link";
import { TEMPLATE_CONTENT_VERSION } from "@/lib/agent-hub/version";
import { isRedisConfigured, listAllRepoConfigs } from "@/lib/github-app/repoConfigStore";
import { RepoConfigCard } from "./RepoConfigCard";

export const metadata: Metadata = { title: "Admin — Sync", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // this page's whole job is live state — never cache it

export default async function AdminSyncPage() {
  if (!isRedisConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">Admin — Sync</h1>
        <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-4 text-sm text-[var(--color-ink)]">
          Redis isn&apos;t configured (<code className="font-mono text-xs">UPSTASH_REDIS_REST_URL</code> /{" "}
          <code className="font-mono text-xs">UPSTASH_REDIS_REST_TOKEN</code>), so there&apos;s no tracked-repo state to show. Agent Hub Sync itself
          requires Redis — see the README&apos;s Environment variables section.
        </p>
      </div>
    );
  }

  const configs = await listAllRepoConfigs();
  configs.sort((a, b) => (b.lastSyncedAt ?? 0) - (a.lastSyncedAt ?? 0));

  const staleCount = configs.filter((c) => c.lastSyncedContentVersion !== TEMPLATE_CONTENT_VERSION).length;
  const errorCount = configs.filter((c) => c.lastSyncStatus === "error").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[var(--color-ink)]">Admin — Sync</h1>
          <Link href="/admin" className="text-sm text-[var(--color-accent)] underline underline-offset-2">
            ← Usage analytics
          </Link>
        </div>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Every repo Agent Hub Sync is watching, what it&apos;s configured to generate, and the outcome of its last run — visible only to you, behind
          Basic Auth. This is the proof-of-life the webhook logs alone don&apos;t give you.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-2xl font-bold text-[var(--color-ink)]">{configs.length}</div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-muted)]">Repos tracked</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-[var(--color-ink)]">{staleCount}</div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-muted)]">Behind current content version</div>
        </div>
        <div className="card p-4">
          <div className={`text-2xl font-bold ${errorCount > 0 ? "text-red-600" : "text-[var(--color-ink)]"}`}>{errorCount}</div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-muted)]">Last run errored</div>
        </div>
      </div>

      {configs.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-muted)]">
          No repos tracked yet. Install your GitHub App on a repository from the <Link href="/sync" className="underline underline-offset-2">Sync</Link>{" "}
          page to see it show up here.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {configs.map((c) => (
            <RepoConfigCard key={`${c.installationId}::${c.repoFullName}`} config={c} />
          ))}
        </div>
      )}
    </div>
  );
}
