import { build as esbuild } from "esbuild";

/**
 * Bundle the Express app for the Vercel isolate. Snapshots and fixtures are
 * inlined as JSON. Runtime npm deps stay external so the function uses the
 * install that Vercel already performed.
 */
await esbuild({
  entryPoints: ["server/vercel.ts"],
  platform: "node",
  bundle: true,
  format: "esm",
  outfile: "dist/function.js",
  packages: "external",
  loader: { ".json": "json" },
  logLevel: "info",
});
