import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { measurePollutionPerformance } from '../tests/fixtures/measurePollutionPerformance';
import { measureServicePerformance } from '../tests/fixtures/measureServicePerformance';

// Run the same workloads without Vitest's module instrumentation. Build time is excluded.
const pollution = measurePollutionPerformance();
const services = measureServicePerformance();
assert.equal(new Set(pollution.hashes).size, 1);
assert.equal(services.population, 100000);
assert.ok(services.enrolled > 0);
mkdirSync('test-results', { recursive: true });
writeFileSync(
  'test-results/bundled-simulation-performance.json',
  JSON.stringify(
    {
      runtime: process.version,
      note: 'Minified Vite SSR bundle, Node CPU only. Same workloads as the Vitest kernels; excludes build, browser IPC, rendering and GPU. This is not a browser performance budget acceptance test.',
      pollution,
      services,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Bundled CPU benchmark: test-results/bundled-simulation-performance.json',
);
