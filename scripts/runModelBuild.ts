import { build } from 'vite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Bundle project TypeScript with the existing Vite toolchain; no TS runner dependency.
const outDir = resolve('node_modules/.cache/webcity-model-builder');
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve('scripts/generateModels.ts'),
    outDir,
    emptyOutDir: true,
    minify: false,
  },
});
await import(pathToFileURL(resolve(outDir, 'generateModels.js')).href);
