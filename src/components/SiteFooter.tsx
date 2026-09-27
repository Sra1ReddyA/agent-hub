import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-[var(--color-muted)]">
        <p className="font-semibold text-[var(--color-ink)]">Agent Hub</p>
        <p className="mt-2 max-w-xl">
          A free, standalone generator for stack-specific AI coding agent configuration — GitHub Copilot, Claude Code, Cursor, Windsurf, Cline,
          Continue.dev, Aider and the open AGENTS.md convention all read the files it builds. Everything runs client-side; nothing you type or generate is
          ever sent to a server.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/" className="hover:text-[var(--color-ink)] hover:underline">
            Generator
          </Link>
          <Link href="/guides" className="hover:text-[var(--color-ink)] hover:underline">
            Guides
          </Link>
        </div>
        <p className="mt-6 text-xs">© {new Date().getFullYear()} Agent Hub</p>
      </div>
    </footer>
  );
}
