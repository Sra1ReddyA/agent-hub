import type { GeneratedFile } from "./types";

/** Which generated files actually need writing, given what's already on disk / in the repo (`null` = missing).
 * Ordinary files are written when missing or different; create-only files (the agent-maintained knowledge base)
 * are written ONLY when missing — regenerating must never erase what the agents have accumulated in them.
 * Shared by Agent Hub Sync and the CLI so both behave identically. */
export function filesToWrite(files: GeneratedFile[], existing: (string | null)[]): GeneratedFile[] {
  return files.filter((f, i) => (f.createOnly ? existing[i] === null : existing[i] !== f.content));
}
