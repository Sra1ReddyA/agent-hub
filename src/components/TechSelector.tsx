"use client";

import { useMemo } from "react";
import { STACKS, type Stack, type StackCategory, type StackId } from "@/lib/agent-hub/stacks";

const CATEGORY_ORDER: StackCategory[] = ["Languages", "Backend & APIs", "Frontend", "Database", "Mobile", "Tools"];

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Multi-select stack picker, grouped into tiers (Languages, Backend & APIs, Frontend, Database, Mobile,
 * Tools). Build any combination — a single stack, or a full custom stack like Python + FastAPI + React +
 * MongoDB — by checking as many as apply. Selected stacks also surface as removable tags above the grid
 * so a large combination stays easy to review and edit at a glance. */
export function TechSelector({ selectedIds, onToggle }: { selectedIds: StackId[]; onToggle: (id: StackId) => void }) {
  const byCategory = useMemo(() => {
    const map = new Map<StackCategory, Stack[]>();
    for (const s of STACKS) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return map;
  }, []);

  const selected = useMemo(() => STACKS.filter((s) => selectedIds.includes(s.id)), [selectedIds]);

  return (
    <div className="space-y-5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-3">
          <span className="self-center pr-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Your stack ({selected.length}):
          </span>
          {selected.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)] bg-[var(--color-surface)] py-1 pl-2.5 pr-1.5 text-xs font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
              title={`Remove ${s.label}`}
            >
              <span>
                {s.emoji} {s.label}
              </span>
              <XIcon />
            </button>
          ))}
        </div>
      )}

      {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{category}</h3>
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {byCategory.get(category)!.map((s) => {
              const active = selectedIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle(s.id)}
                  className={`relative flex flex-col items-start gap-1 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]"
                  }`}
                >
                  <span
                    className={`absolute right-2 top-2 grid h-4 w-4 place-items-center rounded border ${
                      active ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white" : "border-[var(--color-border)] text-transparent"
                    }`}
                  >
                    <CheckIcon />
                  </span>
                  <span className="text-xl leading-none">{s.emoji}</span>
                  <span className="text-sm font-semibold text-[var(--color-ink)]">{s.label}</span>
                  <span className="text-[11px] leading-snug text-[var(--color-muted)]">{s.tagline}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
