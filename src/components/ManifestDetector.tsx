"use client";

import { useState } from "react";
import { detectStacksFromManifest } from "@/lib/agent-hub/detect";
import { STACKS, type StackId } from "@/lib/agent-hub/stacks";

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

/** Instead of asking a person to remember and manually check every technology their repo uses, this reads
 * it straight from the source of truth: paste in a `package.json`, `requirements.txt`, `pyproject.toml`,
 * `go.mod`, `Cargo.toml`, a Gemfile, a `.csproj`, or any mix of them, and Agent Hub pre-selects the exact
 * combination it finds — including a stack the person forgot they had. Purely additive: detected stacks
 * are merged into whatever's already checked, nothing is ever removed automatically. */
export function ManifestDetector({ onDetect }: { onDetect: (ids: StackId[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<StackId[] | null>(null);

  function detect() {
    const found = detectStacksFromManifest(text);
    setResult(found);
    if (found.length > 0) onDetect(found);
  }

  return (
    <div className="card p-5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="flex items-center gap-2 font-semibold text-[var(--color-ink)]">
            <SparkleIcon /> Detect your stack automatically
          </span>
          <span className="mt-1 block text-sm text-[var(--color-muted)]">
            Paste your <code className="font-mono text-[12px]">package.json</code>, <code className="font-mono text-[12px]">requirements.txt</code>,{" "}
            <code className="font-mono text-[12px]">go.mod</code>, or any manifest — Agent Hub reads your real dependencies instead of you
            remembering every one.
          </span>
        </span>
        <span className="pill shrink-0">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{"dependencies": {"react": "^19.0.0", "next": "^16.0.0"}}'
            rows={6}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={detect} disabled={!text.trim()} className="btn-primary text-sm">
              <SparkleIcon /> Detect stacks
            </button>
            {result !== null && (
              <span className="text-sm text-[var(--color-muted)]">
                {result.length === 0
                  ? "No recognized stacks found in that text — check the picker below manually."
                  : `Found and selected: ${result.map((id) => STACKS.find((s) => s.id === id)?.label ?? id).join(", ")}`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
