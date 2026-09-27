"use client";

import { useMemo, useState } from "react";
import type { StackId } from "@/lib/agent-hub/stacks";
import { buildBundle, buildBundleZip, type GenerationMode, type GeneratedFile } from "@/lib/agent-hub/generator";
import { TARGETS, type TargetId } from "@/lib/agent-hub/targets";
import { TEMPLATE_CONTENT_VERSION } from "@/lib/agent-hub/version";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CopyButton({ text, label = "Copy file" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className="btn-secondary shrink-0 !px-2.5 !py-1 text-xs"
    >
      <CopyIcon /> {copied ? "Copied!" : label}
    </button>
  );
}

const MODES: { id: GenerationMode; title: string; body: string; badge?: string }[] = [
  {
    id: "combined",
    title: "Combined — one unified agent",
    badge: "Recommended",
    body: "Every selected stack merged into a single .agent.md, plus matching files for each tool below. One agent understands the whole stack — how a frontend change affects a backend endpoint, how a schema change reaches the UI.",
  },
  {
    id: "modular",
    title: "Modular — one file per stack",
    body: "Each stack gets its own independent rule file per tool (e.g. a react-agent.md and a fastapi-agent.md side by side). A shared root file carries the guardrails that apply everywhere, once.",
  },
];

function ModeToggle({ mode, onChange, disabled }: { mode: GenerationMode; onChange: (m: GenerationMode) => void; disabled: boolean }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(m.id)}
            className={`flex flex-col items-start gap-1 rounded-[var(--radius-lg)] border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]"
            }`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--color-ink)]">{m.title}</span>
              {m.badge && <span className="pill !py-0.5 !text-[10px] text-[var(--color-accent)]">{m.badge}</span>}
            </span>
            <span className="text-[12px] leading-snug text-[var(--color-muted)]">{m.body}</span>
          </button>
        );
      })}
    </div>
  );
}

function TargetPicker({ targetIds, onToggle }: { targetIds: TargetId[]; onToggle: (id: TargetId) => void }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {TARGETS.map((t) => {
        const active = targetIds.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(t.id)}
            className={`flex items-start gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
              active
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]"
            }`}
          >
            <span
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                active ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white" : "border-[var(--color-border)] text-transparent"
              }`}
            >
              <CheckIcon />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-sm font-semibold text-[var(--color-ink)]">{t.label}</span>
                <span className="text-[11px] text-[var(--color-muted)]">{t.vendor}</span>
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--color-muted)]">{t.blurb}</span>
              <span className="mt-1 block truncate font-mono text-[10.5px] text-[var(--color-muted)]">{t.pathsPreview.join(" · ")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function OutputPreview({
  stackIds,
  mode,
  onModeChange,
  targetIds,
  onToggleTarget,
  customRules,
  onCustomRulesChange,
  includeCiCheck,
  onToggleCiCheck,
  shareUrl,
}: {
  stackIds: StackId[];
  mode: GenerationMode;
  onModeChange: (m: GenerationMode) => void;
  targetIds: TargetId[];
  onToggleTarget: (id: TargetId) => void;
  customRules: string;
  onCustomRulesChange: (v: string) => void;
  includeCiCheck: boolean;
  onToggleCiCheck: (v: boolean) => void;
  shareUrl: string;
}) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const files: GeneratedFile[] = useMemo(
    () => buildBundle(stackIds, targetIds, mode, { customRules, includeCiCheck }),
    [stackIds, targetIds, mode, customRules, includeCiCheck],
  );
  const activeFile = files.find((f) => f.path === activePath) ?? files[0] ?? null;
  const singleStack = stackIds.length === 1;

  async function download() {
    setZipping(true);
    try {
      const blob = await buildBundleZip(stackIds, targetIds, mode, { customRules, includeCiCheck });
      const { saveAs } = await import("file-saver");
      const name = stackIds.length <= 3 ? stackIds.join("-") : "fullstack";
      saveAs(blob, `${name}-agent-bundle.zip`);
      // Stamp the content version this download came from, purely in this browser's localStorage, so a
      // later visit can tell you "the guardrails you downloaded are now behind" (see AgentHub.tsx). Never
      // sent anywhere — this is the same-device staleness check, not a tracking signal.
      try {
        localStorage.setItem("agent-hub-last-download-version", TEMPLATE_CONTENT_VERSION);
      } catch {}
      // Best-effort usage signal for the /admin dashboard — never awaited, never allowed to affect the
      // download itself. Only ids are sent: no file content, no custom-rules text.
      fetch("/api/track-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stacks: stackIds, mode, targets: targetIds, ci: includeCiCheck }),
        keepalive: true,
      }).catch(() => {});
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="font-semibold text-[var(--color-ink)]">2. Choose your output format</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {singleStack
            ? "With a single stack picked, Combined and Modular produce the same file — the toggle matters once you add a second stack."
            : "Combined merges your whole stack into one cross-aware agent. Modular keeps every stack's rules in its own file. Both automatically include the Universal Guardrails and the mandatory end-of-session summary chart."}
        </p>
        <div className="mt-4">
          <ModeToggle mode={mode} onChange={onModeChange} disabled={singleStack} />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--color-ink)]">3. Make it yours (optional)</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
              Add rules specific to your team — they're layered on top of everything else and take precedence if the two ever conflict. Turn on
              the CI guardrail check to actually enforce a subset of the guardrails in every pull request, not just document them. Then share the
              exact config with your team as one link, so nobody generates a slightly different bundle.
            </p>
          </div>
          <CopyButton text={shareUrl} label="Copy share link" />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="custom-rules" className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Team-specific directives (one per line)
            </label>
            <textarea
              id="custom-rules"
              value={customRules}
              onChange={(e) => onCustomRulesChange(e.target.value)}
              placeholder={"Always use our internal Logger, never console.log\nAll new endpoints go through the ApiGateway service"}
              rows={4}
              className="mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Enforcement</span>
              <button
                type="button"
                aria-pressed={includeCiCheck}
                onClick={() => onToggleCiCheck(!includeCiCheck)}
                className={`mt-1.5 flex w-full items-start gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                  includeCiCheck
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                    includeCiCheck ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white" : "border-[var(--color-border)] text-transparent"
                  }`}
                >
                  <CheckIcon />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
                    <ShieldIcon /> Add CI guardrail check
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--color-muted)]">
                    Adds a GitHub Actions workflow that fails a PR if it commits a `.env` file, a hard-coded secret, or a silenced lint rule — the
                    same Never Allowed rules the agent was told to follow, now checked automatically, on every push.
                  </span>
                </span>
              </button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
              <LinkIcon /> Share link includes your stacks, mode, tools, custom rules and this toggle — paste it in Slack and everyone gets the
              identical bundle.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-[var(--color-ink)]">4. Pick your AI coding tool(s)</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Any number, at once. Not sure which you use?{" "}
          <a href="/guides" className="font-medium text-[var(--color-accent)] hover:underline">
            See the guide for each
          </a>
          .
        </p>
        <div className="mt-4">
          <TargetPicker targetIds={targetIds} onToggle={onToggleTarget} />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[var(--color-ink)]">
            5. Your bundle — <span className="text-[var(--color-muted)] font-normal">{files.length} files</span>
          </h2>
          <button type="button" onClick={download} disabled={zipping || files.length === 0} className="btn-primary text-sm">
            <DownloadIcon /> {zipping ? "Zipping…" : "Download bundle (.zip)"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
          <nav className="flex gap-1.5 overflow-x-auto md:flex-col md:overflow-visible">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setActivePath(f.path)}
                className={`shrink-0 rounded-[var(--radius-md)] border px-3 py-2 text-left font-mono text-xs transition-colors ${
                  activeFile?.path === f.path
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:border-[var(--color-accent)]"
                }`}
                title={f.path}
              >
                {f.path}
              </button>
            ))}
          </nav>

          {activeFile && (
            <div className="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                <span className="truncate font-mono text-xs font-semibold text-[var(--color-ink)]">{activeFile.path}</span>
                <CopyButton text={activeFile.content} />
              </div>
              <pre className="max-h-[420px] overflow-auto bg-[var(--color-surface)] p-4 text-[12.5px] leading-relaxed text-[var(--color-ink)]">
                <code>{activeFile.content}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
