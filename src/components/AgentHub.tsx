"use client";

import { useEffect, useMemo, useState } from "react";
import { STACKS, type StackId } from "@/lib/agent-hub/stacks";
import { DEFAULT_MODE, DEFAULT_TARGETS, type GenerationMode } from "@/lib/agent-hub/generator";
import { TARGETS, type TargetId } from "@/lib/agent-hub/targets";
import { buildShareUrl, readShareConfig } from "@/lib/agent-hub/share-config";
import { TechSelector } from "./TechSelector";
import { OutputPreview } from "./OutputPreview";
import { ManifestDetector } from "./ManifestDetector";

const STACKS_STORAGE_KEY = "agent-hub-selected-stacks";
const MODE_STORAGE_KEY = "agent-hub-mode";
const TARGETS_STORAGE_KEY = "agent-hub-last-targets";
const CUSTOM_RULES_STORAGE_KEY = "agent-hub-custom-rules";
const CI_CHECK_STORAGE_KEY = "agent-hub-ci-check";

/** Restores the last selection made in this browser (localStorage only — nothing leaves the device) so
 * refreshing or coming back later doesn't lose your place — UNLESS the page was opened with a `?config=`
 * link (see `share-config.ts`), in which case that shared config wins on this load and is then persisted
 * the same way, so a teammate who opens a shared link and comes back later still sees it next time too. */
function usePersistedSelection() {
  const [stackIds, setStackIdsState] = useState<StackId[]>([]);
  const [mode, setModeState] = useState<GenerationMode>(DEFAULT_MODE);
  const [targetIds, setTargetIdsState] = useState<TargetId[]>(DEFAULT_TARGETS);
  const [customRules, setCustomRulesState] = useState("");
  const [includeCiCheck, setIncludeCiCheckState] = useState(false);

  useEffect(() => {
    try {
      const shared = readShareConfig();
      if (shared) {
        setStackIdsState(shared.s);
        setModeState(shared.m);
        setTargetIdsState(shared.t);
        setCustomRulesState(shared.r);
        setIncludeCiCheckState(shared.c);
        localStorage.setItem(STACKS_STORAGE_KEY, JSON.stringify(shared.s));
        localStorage.setItem(MODE_STORAGE_KEY, shared.m);
        localStorage.setItem(TARGETS_STORAGE_KEY, JSON.stringify(shared.t));
        localStorage.setItem(CUSTOM_RULES_STORAGE_KEY, shared.r);
        localStorage.setItem(CI_CHECK_STORAGE_KEY, shared.c ? "1" : "0");
        return;
      }

      const savedStacks = localStorage.getItem(STACKS_STORAGE_KEY);
      if (savedStacks) {
        const parsed: unknown = JSON.parse(savedStacks);
        if (Array.isArray(parsed) && parsed.every((id) => STACKS.some((s) => s.id === id))) {
          setStackIdsState(parsed as StackId[]);
        }
      }
      const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
      if (savedMode === "combined" || savedMode === "modular") setModeState(savedMode);
      const savedTargets = localStorage.getItem(TARGETS_STORAGE_KEY);
      if (savedTargets) {
        const parsed: unknown = JSON.parse(savedTargets);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((t) => TARGETS.some((x) => x.id === t))) {
          setTargetIdsState(parsed as TargetId[]);
        }
      }
      const savedRules = localStorage.getItem(CUSTOM_RULES_STORAGE_KEY);
      if (savedRules) setCustomRulesState(savedRules);
      setIncludeCiCheckState(localStorage.getItem(CI_CHECK_STORAGE_KEY) === "1");
    } catch {}
  }, []);

  const toggleStack = (id: StackId) => {
    setStackIdsState((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      try {
        localStorage.setItem(STACKS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  /** Merges a batch of detected stack ids (from `ManifestDetector`) into the current selection without
   * removing anything already checked — detection is additive, never destructive. */
  const mergeStacks = (ids: StackId[]) => {
    setStackIdsState((prev) => {
      const next = [...new Set([...prev, ...ids])];
      try {
        localStorage.setItem(STACKS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const setMode = (next: GenerationMode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {}
  };

  const toggleTarget = (id: TargetId) => {
    setTargetIdsState((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      const safe = next.length > 0 ? next : prev; // never allow zero targets selected
      try {
        localStorage.setItem(TARGETS_STORAGE_KEY, JSON.stringify(safe));
      } catch {}
      return safe;
    });
  };

  const setCustomRules = (next: string) => {
    setCustomRulesState(next);
    try {
      localStorage.setItem(CUSTOM_RULES_STORAGE_KEY, next);
    } catch {}
  };

  const setIncludeCiCheck = (next: boolean) => {
    setIncludeCiCheckState(next);
    try {
      localStorage.setItem(CI_CHECK_STORAGE_KEY, next ? "1" : "0");
    } catch {}
  };

  return {
    stackIds,
    toggleStack,
    mergeStacks,
    mode,
    setMode,
    targetIds,
    toggleTarget,
    customRules,
    setCustomRules,
    includeCiCheck,
    setIncludeCiCheck,
  };
}

export function AgentHub() {
  const {
    stackIds,
    toggleStack,
    mergeStacks,
    mode,
    setMode,
    targetIds,
    toggleTarget,
    customRules,
    setCustomRules,
    includeCiCheck,
    setIncludeCiCheck,
  } = usePersistedSelection();

  const shareUrl = useMemo(
    () => buildShareUrl({ s: stackIds, m: mode, t: targetIds, r: customRules, c: includeCiCheck }),
    [stackIds, mode, targetIds, customRules, includeCiCheck],
  );

  return (
    <div className="space-y-6">
      <ManifestDetector onDetect={mergeStacks} />

      <div className="card p-5">
        <h2 className="font-semibold text-[var(--color-ink)]">1. Build your stack</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Pick every technology this repository is built on — one, or a full custom combination like Python + FastAPI + React + MongoDB. Agent
          Hub folds real best practices, type-safety patterns, performance concerns and anti-patterns for each into one consolidated agent — 22
          stacks across languages, backends, frontends, databases, mobile and tools.
        </p>
        <div className="mt-4">
          <TechSelector selectedIds={stackIds} onToggle={toggleStack} />
        </div>
      </div>

      {stackIds.length > 0 && (
        <OutputPreview
          stackIds={stackIds}
          mode={mode}
          onModeChange={setMode}
          targetIds={targetIds}
          onToggleTarget={toggleTarget}
          customRules={customRules}
          onCustomRulesChange={setCustomRules}
          includeCiCheck={includeCiCheck}
          onToggleCiCheck={setIncludeCiCheck}
          shareUrl={shareUrl}
        />
      )}
    </div>
  );
}
