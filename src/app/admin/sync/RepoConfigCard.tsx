"use client";

import { useActionState } from "react";
import { STACKS } from "@/lib/agent-hub/stacks";
import { TARGETS } from "@/lib/agent-hub/targets";
import { TEMPLATE_CONTENT_VERSION } from "@/lib/agent-hub/version";
import type { RepoConfig, SyncStatus } from "@/lib/github-app/repoConfigStore";
import type { SyncResult } from "@/lib/github-app/sync";
import { updateRepoConfig, triggerSyncNow, type ActionState } from "./actions";

/**
 * One repo's status + editable config on `/admin/sync`. A Client Component specifically so its two forms
 * can bind through `useActionState` — that gives each button a real pending state ("Saving…"/"Syncing…")
 * and an inline result message, and (just as important) means submitting doesn't trigger a full page
 * navigation, so this card's own `<details>` stays open across a submit instead of snapping shut like
 * every other panel on the page would after a server-rendered refresh.
 */

const IDLE: ActionState = { kind: "idle" };

function repoKey(c: RepoConfig) {
  return `${c.installationId}::${c.repoFullName}`;
}

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

function syncResultLabel(result: SyncResult): string {
  switch (result.status) {
    case "pr-opened":
      return "Opened a new PR.";
    case "pr-updated":
      return "Updated the existing PR.";
    case "up-to-date":
      return "Ran — nothing changed, already up to date.";
    case "no-manifest-signal":
      return "Ran — no recognizable manifest found in the repo root.";
    default:
      return "Ran.";
  }
}

export function RepoConfigCard({ config: c }: { config: RepoConfig }) {
  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(updateRepoConfig, IDLE);
  const [syncState, syncAction, syncing] = useActionState<ActionState, FormData>(triggerSyncNow, IDLE);

  return (
    <details className="card overflow-hidden p-0">
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
          <a href={c.lastPrUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-[var(--color-accent)] underline underline-offset-2">
            Last PR ↗
          </a>
        )}
      </summary>

      <div className="border-t border-[var(--color-border)] p-4">
        {c.lastSyncStatus === "error" && c.lastSyncError && (
          <p className="mb-4 rounded-[var(--radius-md)] border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-700">{c.lastSyncError}</p>
        )}

        <form action={saveAction} className="space-y-4">
          <input type="hidden" name="key" value={repoKey(c)} />

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
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">
              Unchecking one that&apos;s still detected in the repo&apos;s manifest won&apos;t stick — the next sync re-adds anything it still finds.
            </p>
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

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Saving…" : "Save config"}
            </button>
            {saveState.kind === "saved" && <span className="text-xs font-medium text-emerald-600">Saved.</span>}
            {saveState.kind === "error" && <span className="text-xs font-medium text-red-600">{saveState.message}</span>}
            <span className="text-xs text-[var(--color-muted)]">Applies on the next push or sync run — doesn&apos;t sync immediately.</span>
          </div>
        </form>

        <form action={syncAction} className="mt-3 border-t border-[var(--color-border)] pt-3">
          <input type="hidden" name="key" value={repoKey(c)} />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={syncing}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-ink)] hover:bg-[var(--color-border)]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncing ? "Syncing…" : "Sync now →"}
            </button>
            {syncState.kind === "synced" && (
              <span className="text-xs font-medium text-[var(--color-ink)]">
                {syncResultLabel(syncState.result)}
                {"url" in syncState.result && (
                  <>
                    {" "}
                    <a href={syncState.result.url} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] underline underline-offset-2">
                      View PR ↗
                    </a>
                  </>
                )}
              </span>
            )}
            {syncState.kind === "error" && <span className="text-xs font-medium text-red-600">Sync failed: {syncState.message}</span>}
          </div>
        </form>
      </div>
    </details>
  );
}
