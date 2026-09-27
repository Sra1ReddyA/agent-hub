"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Mounted once in the root layout. Fires a single, tiny, fire-and-forget beacon to `/api/track` whenever
 * the path changes (including the very first load) — `sendBeacon` is used specifically because it's
 * designed for exactly this ("record this and don't make the page wait for it, even if it's about to
 * navigate away"). Renders nothing; a visitor never sees this component. If `/admin` is never opened by
 * anyone, this has zero visible effect on the app — it's purely additive instrumentation. */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const payload = JSON.stringify({ path: pathname || "/", ref: document.referrer || "" });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/track", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      }
    } catch {
      // Analytics is best-effort only — never let this throw into the app.
    }
  }, [pathname]);

  return null;
}
