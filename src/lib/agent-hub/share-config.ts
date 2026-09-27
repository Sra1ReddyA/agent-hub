import { STACKS, type StackId } from "./stacks";
import { TARGETS, type TargetId } from "./targets";
import type { GenerationMode } from "./generator";

/**
 * Encodes the entire generator configuration — stacks, mode, tools, custom team rules, CI check toggle —
 * into a single URL query param, and decodes it back. This is what turns Agent Hub from "a tool one person
 * uses" into "a standard a whole team shares": a lead configures the exact bundle once, copies the link,
 * and every teammate who opens it gets the identical selection with nothing to remember or misconfigure —
 * no backend, no accounts, no database, just a compact payload in the URL itself.
 */
export type ShareConfig = {
  s: StackId[]; // stacks
  m: GenerationMode; // mode
  t: TargetId[]; // targets
  r: string; // custom rules
  c: boolean; // include CI check
};

const PARAM = "config";

function toBase64Url(json: string): string {
  const base64 = typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(json))) : "";
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return decodeURIComponent(escape(window.atob(base64)));
}

/** Builds a full shareable URL (current origin + path + encoded config) for the given selection. Safe to
 * call on every render — it's cheap — the caller decides when to actually surface/copy it. */
export function buildShareUrl(config: ShareConfig): string {
  if (typeof window === "undefined") return "";
  try {
    const encoded = toBase64Url(JSON.stringify(config));
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set(PARAM, encoded);
    return url.toString();
  } catch {
    return window.location.href;
  }
}

/** Reads and validates a `?config=` param from the current URL, discarding anything that doesn't parse or
 * references a stack/target id this version of Agent Hub doesn't recognize (e.g. an older or newer share
 * link) — falling back to `null` so the caller can fall through to its normal localStorage restore. */
export function readShareConfig(): ShareConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = new URLSearchParams(window.location.search).get(PARAM);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Partial<ShareConfig>;
    const s = Array.isArray(p.s) ? p.s.filter((id): id is StackId => STACKS.some((x) => x.id === id)) : [];
    const t = Array.isArray(p.t) ? p.t.filter((id): id is TargetId => TARGETS.some((x) => x.id === id)) : [];
    if (s.length === 0 || t.length === 0) return null;
    return {
      s,
      m: p.m === "modular" ? "modular" : "combined",
      t,
      r: typeof p.r === "string" ? p.r : "",
      c: p.c === true,
    };
  } catch {
    return null;
  }
}
