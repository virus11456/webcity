import { test, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { measureServicePerformance } from '../fixtures/measureServicePerformance';

test('measure service coverage and school assignment with 100k residents and 96 schools', () => {
  const report = measureServicePerformance();
  expect(report.population).toBe(100000);
  expect(report.enrolled).toBeGreaterThan(0);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/services-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
}, 120000);
