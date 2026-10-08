/** One generated file: its path inside the downloaded bundle and its text content. Paths are written to
 * the zip exactly as given — no wrapping parent folder — so extracting the zip at a project root
 * populates the right files (`.github/`, `CLAUDE.md`, `.cursor/rules/`, …) directly. Shared by
 * `generator.ts` and `targets.ts` to avoid a circular import between them. */
export type GeneratedFile = {
  path: string;
  content: string;
  /** Write only if the file doesn't exist yet; never overwrite it. Used for files an agent or a person keeps
   * editing after generation (the `.agent/knowledge.md` memory) — regenerating or syncing must not erase
   * what they have accumulated. */
  createOnly?: boolean;
};
