import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = await mkdtemp(join(tmpdir(), 'webcity-simulation-benchmark-'));
try {
  await build({
    configFile: false,
    logLevel: 'warn',
    ssr: { noExternal: true },
    build: {
      ssr: resolve('scripts/benchmarkSimulation.ts'),
      outDir,
      emptyOutDir: true,
      minify: true,
      rolldownOptions: { output: { entryFileNames: 'benchmark.mjs' } },
    },
  });
  await import(pathToFileURL(join(outDir, 'benchmark.mjs')).href);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
