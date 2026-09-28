import type { Metadata } from "next";
import Link from "next/link";
import { STACKS } from "@/lib/agent-hub/stacks";
import { TARGETS } from "@/lib/agent-hub/targets";
import { TEMPLATE_CONTENT_VERSION } from "@/lib/agent-hub/version";
import { isRedisConfigured, listAllRepoConfigs, type RepoConfig, type SyncStatus } from "@/lib/github-app/repoConfigStore";
import { updateRepoConfig, triggerSyncNow } from "./actions";

export const metadata: Metadata = { title: "Admin — Sync", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // this page's whole job is live state — never cache it

const key = (c: RepoConfig) => `${c.installationId}::${c.repoFullName}`;

function statusBadge(status: SyncStatus | null) {
  const styles: Record<string, string> = {
    "pr-opened": "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/40",
    "pr-updated": "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/40",
    "up-to-date": "bg-[var(--color-border)]/40 text-[var(--color-muted)] border-[var(--color-border)]",
    "no-manifest-signal": "bg-[var(--color-border)]/40 text-[var(--color-muted)] border-[var(--color-border)]",
    error: "bg-red-500/10 text-red-600 border-red-500/40",
  };
  const labels: Record<string, string> = {
    "pr-opened": "PR opened",
    "pr-updated": "PR updated",
    "up-to-date": "Up to date",
    "no-manifest-signal": "No manifest signal",
    error: "Error",
  };
  if (!status) return <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)]">Never run</span>;
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}

function timeAgo(ts: number | null) {
  if (!ts) return "never";
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

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
            <details key={key(c)} className="card overflow-hidden p-0">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
                <span className="font-mono text-sm font-semibold text-[var(--color-ink)]">{c.repoFullName}</span>
                {statusBadge(c.lastSyncStatus)}
                <span className="text-xs text-[var(--color-muted)]">checked {timeAgo(c.lastSyncedAt)}</span>
                {c.lastSyncedContentVersion !== TEMPLATE_CONTENT_VERSION && (
                  <span className="rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs text-[var(--color-accent)]">
                    content v{c.lastSyncedContentVersion ?? "—"} → v{TEMPLATE_CONTENT_VERSION} available
                  </span>
                )}
                {c.lastPrUrl && (
                  <a
                    href={c.lastPrUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs text-[var(--color-accent)] underline underline-offset-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Last PR ↗
                  </a>
                )}
              </summary>

              <div className="border-t border-[var(--color-border)] p-4">
                {c.lastSyncStatus === "error" && c.lastSyncError && (
                  <p className="mb-4 rounded-[var(--radius-md)] border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-700">
                    {c.lastSyncError}
                  </p>
                )}

                <form action={updateRepoConfig} className="space-y-4">
                  <input type="hidden" name="key" value={key(c)} />

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Stacks tracked</p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {STACKS.map((s) => (
                        <label key={s.id} className="flex items-center gap-1.5 text-sm text-[var(--color-ink)]">
                          <input type="checkbox" name="stackIds" value={s.id} defaultChecked={c.stackIds.includes(s.id)} />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Targets generated</p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {TARGETS.map((t) => (
                        <label key={t.id} className="flex items-center gap-1.5 text-sm text-[var(--color-ink)]">
                          <input type="checkbox" name="targetIds" value={t.id} defaultChecked={c.targetIds.includes(t.id)} />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
                      Mode
                      <select name="mode" defaultValue={c.mode} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm">
                        <option value="combined">Combined</option>
                        <option value="modular">Modular</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-[var(--color-ink)]">
                      <input type="checkbox" name="includeCiCheck" defaultChecked={c.includeCiCheck} />
                      Include CI enforcement check
                    </label>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Custom rules</label>
                    <textarea
                      name="customRules"
                      defaultValue={c.customRules ?? ""}
                      rows={3}
                      placeholder="Extra team-specific directives appended to every generated file."
                      className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent p-2 text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button type="submit" className="btn-primary text-sm">
                      Save config
                    </button>
                    <span className="text-xs text-[var(--color-muted)]">Applies on the next push or sync run — doesn&apos;t sync immediately.</span>
                  </div>
                </form>

                <form action={triggerSyncNow} className="mt-3 border-t border-[var(--color-border)] pt-3">
                  <input type="hidden" name="key" value={key(c)} />
                  <button type="submit" className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-ink)] hover:bg-[var(--color-border)]/20">
                    Sync now →
                  </button>
                </form>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
