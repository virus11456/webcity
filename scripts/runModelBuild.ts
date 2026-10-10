import { build } from 'vite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Bundle project TypeScript with the existing Vite toolchain; no TS runner dependency.
const outDir = resolve('node_modules/.cache/webcity-model-builder');
const entry =
  process.argv[2] === 'services' ? 'generateFacilities' : 'generateModels';
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(`scripts/${entry}.ts`),
    outDir,
    emptyOutDir: true,
    minify: false,
  },
});
await import(pathToFileURL(resolve(outDir, `${entry}.js`)).href);
