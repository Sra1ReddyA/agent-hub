import type { RepoSnapshot } from "../src/lib/agent-hub/scan/types";

/** Builds a snapshot from a map of path -> content (all treated as read), plus optional unread paths. */
export function snap(files: Record<string, string>, unreadPaths: string[] = []): RepoSnapshot {
  return { paths: [...Object.keys(files), ...unreadPaths], files };
}
