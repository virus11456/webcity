import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { measureSchoolRetention } from '../fixtures/measureSchoolRetention';
test('measure existing pupil reservation for grouped and interleaved homes', () => {
  const report = measureSchoolRetention();
  for (const row of report) expect(new Set(row.hashes).size).toBe(1);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/school-retention-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
});
