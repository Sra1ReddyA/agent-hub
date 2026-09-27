import { JsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { CHANGELOG, TEMPLATE_CONTENT_VERSION } from "@/lib/agent-hub/version";

export const metadata = pageMetadata({
  title: "Changelog — Agent Hub",
  description:
    "What changed in the guardrails, directives and verification commands Agent Hub generates. Every downloaded bundle is stamped with the content version it came from — check here to see if yours is behind.",
  path: "/changelog",
  keywords: ["agent hub changelog", "ai coding agent rules updates", "cursor rules changelog", "AGENTS.md changelog"],
});

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Agent Hub Changelog",
            itemListElement: CHANGELOG.map((entry, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `v${entry.version} — ${entry.title}`,
            })),
          },
        ]}
      />
      <header className="mb-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">Current content version: v{TEMPLATE_CONTENT_VERSION}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--color-ink)]">Changelog</h1>
        <p className="mx-auto mt-3 max-w-xl text-[var(--color-muted)]">
          Every AI coding tool changes its own conventions constantly — this is the one place that tracks what changed in the guardrails, directives
          and verification commands Agent Hub generates, so a bundle you downloaded a while ago doesn&apos;t quietly go stale without you knowing.
          Regenerate your bundle any time the version below is newer than the footer in your own file.
        </p>
      </header>

      <ol className="space-y-6">
        {CHANGELOG.map((entry) => (
          <li key={entry.version} className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-[var(--color-ink)]">
                v{entry.version} — {entry.title}
              </h2>
              <time className="font-mono text-xs text-[var(--color-muted)]">{entry.date}</time>
            </div>
            {!entry.contentChange && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">Site-only change — doesn&apos;t affect files you&apos;ve already generated.</p>
            )}
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-[var(--color-muted)]">
              {entry.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
