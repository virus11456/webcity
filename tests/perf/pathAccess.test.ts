import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { measurePathAccess } from '../fixtures/measurePathAccess';
test('measure cold and cached road frontage access on short and long roads', () => {
  const report = measurePathAccess();
  for (const row of report) expect(new Set(row.hashes).size).toBe(1);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/path-access-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
});
