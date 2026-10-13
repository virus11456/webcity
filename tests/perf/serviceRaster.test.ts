import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { measureServiceRaster } from '../fixtures/measureServiceRaster';
test('measure cached service raster and uncached fallback separately', () => {
  const report = measureServiceRaster();
  expect(new Set(report.flatMap((row) => row.hashes)).size).toBe(1);
  expect(report[0]!.cachedBytes).toBeGreaterThan(0);
  expect(report[1]!.cachedBytes).toBe(0);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/service-raster-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
});
