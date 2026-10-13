import { test, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { measurePollutionPerformance } from '../fixtures/measurePollutionPerformance';

test('measure exact pollution diffusion on the production 300 x 300 grid', () => {
  const report = measurePollutionPerformance();
  expect(new Set(report.hashes).size).toBe(1);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/pollution-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
}, 120000);
