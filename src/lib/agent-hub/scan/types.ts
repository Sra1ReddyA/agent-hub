/**
 * A read-only picture of a repository, independent of where it came from (GitHub's API for the public
 * `/score` page and for Sync, the local filesystem for the CLI). Everything in `scan/` is a pure function
 * of this shape, which is what makes the scoring deterministic and unit-testable without any network.
 */
export type RepoSnapshot = {
  /** Every file path in the repo, POSIX-style, relative to the root (no leading slash). */
  paths: string[];
  /** Contents of the subset of files that were worth reading (see `selectFilesToRead`). */
  files: Record<string, string>;
  /** True when the source listing was cut short (huge repos) — scores are then a lower bound. */
  truncated?: boolean;
};
