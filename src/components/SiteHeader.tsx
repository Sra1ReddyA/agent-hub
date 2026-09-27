import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-[var(--color-ink)]">
          <span className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent)] font-mono text-xs font-bold text-white">{"{}"}</span>
          Agent&nbsp;Hub
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/guides" className="btn-ghost !px-3">
            Guides
          </Link>
          <span className="pill hidden lg:inline-flex">No sign-up · Runs in your browser</span>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
