import type { Metadata } from "next";
import Link from "next/link";
import { getAnalyticsSummary } from "@/lib/analytics/store";
import { STACKS } from "@/lib/agent-hub/stacks";
import { TARGETS } from "@/lib/agent-hub/targets";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

// Always read fresh from the store — this page's whole job is to show live numbers, and Next.js would
// otherwise be free to cache a server-rendered page that has no dynamic route segments.
export const dynamic = "force-dynamic";

function stackLabel(id: string) {
  return STACKS.find((s) => s.id === id)?.label ?? id;
}
function targetLabel(id: string) {
  return TARGETS.find((t) => t.id === id)?.label ?? id;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-bold text-[var(--color-ink)]">{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
    </div>
  );
}

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-40 shrink-0 truncate text-sm text-[var(--color-ink)]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
        <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-[var(--color-muted)]">{count}</span>
    </div>
  );
}

export default async function AdminPage() {
  const data = await getAnalyticsSummary();
  const maxStack = Math.max(1, ...data.topStacks.map((s) => s.count));
  const maxTarget = Math.max(1, ...data.topTargets.map((t) => t.count));
  const maxDay = Math.max(1, ...data.dailyVisits.map((d) => d.count));
  const ciAdoptionPct = data.totalBundles > 0 ? Math.round((data.ciCheckedCount / data.totalBundles) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[var(--color-ink)]">Admin — Usage Analytics</h1>
          <Link href="/admin/sync" className="text-sm text-[var(--color-accent)] underline underline-offset-2">
            Sync status & config →
          </Link>
        </div>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Visible only to you, behind Basic Auth (see <code className="font-mono text-xs">src/proxy.ts</code>). Nothing here is shown to visitors.
        </p>
        {!data.usingKv && (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-3 text-sm text-[var(--color-ink)]">
            Running on the in-memory fallback — data resets on every deploy/restart and isn&apos;t shared across serverless instances. Add{" "}
            <code className="font-mono text-xs">UPSTASH_REDIS_REST_URL</code> and <code className="font-mono text-xs">UPSTASH_REDIS_REST_TOKEN</code> (a
            free Redis database from the Vercel Marketplace or upstash.com) for durable, production-accurate numbers.
          </p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total visits" value={data.totalVisits} />
        <StatCard label="Bundles generated" value={data.totalBundles} />
        <StatCard label="CI check adoption" value={`${ciAdoptionPct}%`} />
        <StatCard label="Distinct stacks used" value={data.topStacks.length} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">Visits per day (last {data.dailyVisits.length || 0})</h2>
          <div className="mt-3">
            {data.dailyVisits.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No visits recorded yet.</p>
            ) : (
              data.dailyVisits.map((d) => <BarRow key={d.day} label={d.day} count={d.count} max={maxDay} />)
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">Generation mode</h2>
          <div className="mt-3">
            {data.modeCounts.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No bundles generated yet.</p>
            ) : (
              data.modeCounts.map((m) => (
                <BarRow
                  key={m.mode}
                  label={m.mode === "combined" ? "Combined" : "Modular"}
                  count={m.count}
                  max={Math.max(1, ...data.modeCounts.map((x) => x.count))}
                />
              ))
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">Most-picked stacks</h2>
          <div className="mt-3">
            {data.topStacks.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No bundles generated yet.</p>
            ) : (
              data.topStacks.slice(0, 10).map((s) => <BarRow key={s.id} label={stackLabel(s.id)} count={s.count} max={maxStack} />)
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">Most-picked AI tools</h2>
          <div className="mt-3">
            {data.topTargets.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No bundles generated yet.</p>
            ) : (
              data.topTargets.slice(0, 10).map((t) => <BarRow key={t.id} label={targetLabel(t.id)} count={t.count} max={maxTarget} />)
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">Recent visits</h2>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--color-muted)]">
                  <th className="pb-2 pr-2 font-medium">When</th>
                  <th className="pb-2 pr-2 font-medium">Path</th>
                  <th className="pb-2 font-medium">Referrer</th>
                </tr>
              </thead>
              <tbody>
                {data.recentVisits.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-[var(--color-muted)]">
                      No visits recorded yet.
                    </td>
                  </tr>
                )}
                {data.recentVisits.map((v, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-[var(--color-muted)]">{formatTime(v.ts)}</td>
                    <td className="py-1.5 pr-2 font-mono text-[var(--color-ink)]">{v.path}</td>
                    <td className="py-1.5 text-[var(--color-muted)]">{v.ref || "direct"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">Recent bundles generated</h2>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--color-muted)]">
                  <th className="pb-2 pr-2 font-medium">When</th>
                  <th className="pb-2 pr-2 font-medium">Stacks</th>
                  <th className="pb-2 pr-2 font-medium">Mode</th>
                  <th className="pb-2 font-medium">CI</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBundles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-[var(--color-muted)]">
                      No bundles generated yet.
                    </td>
                  </tr>
                )}
                {data.recentBundles.map((b, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-[var(--color-muted)]">{formatTime(b.ts)}</td>
                    <td className="py-1.5 pr-2 text-[var(--color-ink)]">{b.stacks.map(stackLabel).join(", ")}</td>
                    <td className="py-1.5 pr-2 text-[var(--color-muted)]">{b.mode}</td>
                    <td className="py-1.5 text-[var(--color-muted)]">{b.ci ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
