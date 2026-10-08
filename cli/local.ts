import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IGNORED_DIR, MAX_FILE_CHARS, selectFilesToRead } from "../src/lib/agent-hub/scan/select";
import type { RepoSnapshot } from "../src/lib/agent-hub/scan/types";

const MAX_FILES = 25_000;
const MAX_DEPTH = 12;
const MAX_READ_BYTES = 200_000;

/** Builds a `RepoSnapshot` from a directory on disk, using exactly the same file-selection rules as the website
 * and Sync so a local score matches a remote one. Symlinks are never followed (a link can't pull the scan
 * outside the project), and nothing is executed — files are only read as text. */
export function snapshotFromDisk(root: string): RepoSnapshot {
  const paths: string[] = [];
  let truncated = false;

  const walk = (rel: string, depth: number) => {
    if (truncated || depth > MAX_DEPTH) return;
    let entries: string[];
    try {
      entries = readdirSync(join(root, rel));
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      const childRel = rel ? `${rel}/${name}` : name;
      if (IGNORED_DIR.test(childRel)) continue;
      let st;
      try {
        st = lstatSync(join(root, childRel));
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(childRel, depth + 1);
      else if (st.isFile()) {
        if (paths.length >= MAX_FILES) {
          truncated = true;
          return;
        }
        paths.push(childRel);
      }
    }
  };
  walk("", 0);

  const files: Record<string, string> = {};
  for (const p of selectFilesToRead(paths)) {
    try {
      const full = join(root, p);
      if (lstatSync(full).size > MAX_READ_BYTES) continue;
      const text = readFileSync(full, "utf-8");
      files[p] = text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) : text;
    } catch {
      // unreadable file — one fewer signal
    }
  }
  return { paths, files, truncated };
}
