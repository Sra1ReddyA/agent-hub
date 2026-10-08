// Bundles cli/bin.ts (plus the generator, scanner and templates it imports) into ONE dependency-free file,
// cli/agent-hub.mjs, so `node cli/agent-hub.mjs score .` works without installing anything or running a build.
import { build } from "esbuild";

await build({
  entryPoints: ["cli/bin.ts"],
  outfile: "cli/agent-hub.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
  logLevel: "info",
});
