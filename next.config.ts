import type { NextConfig } from "next";

// Agent Hub is fully client-side and static-exportable: the bundle generator and zip builder run
// entirely in the browser (see src/lib/agent-hub/generator.ts). No API routes, no database, no
// server-only packages — so this config stays intentionally minimal.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Produces a self-contained server bundle in .next/standalone — what the Dockerfile copies out.
  // Vercel's builder ignores this and uses its own pipeline, so it's safe to leave on for both targets.
  output: "standalone",
  // `npm run dev` only: let phones/laptops on your own network open the "Network" URL.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`), "*.local"],
};

export default nextConfig;
