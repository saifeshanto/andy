// Bundles the API and cron entry into single ESM files so Hostinger needs no TypeScript or build step.
import { build } from 'esbuild';

await build({
  entryPoints: { server: 'src/server.ts', cron: 'scripts/cron.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  // Some CommonJS deps call require(); give ESM bundles a working require.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
