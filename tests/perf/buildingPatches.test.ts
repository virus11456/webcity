import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildingPatchBatch } from '../fixtures/buildingPatchBatch';
import { mergeBuildingPatches } from '../../src/sim/buildingPatches';

test('measure ordered daily-style building patch merging', () => {
  const patches = buildingPatchBatch(),
    samples: number[] = [],
    hashes: string[] = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    const result = mergeBuildingPatches(patches);
    samples.push(performance.now() - start);
    expect(result.length).toBe(2128);
    hashes.push(
      createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    );
  }
  expect(new Set(hashes).size).toBe(1);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/building-patch-performance.json',
    JSON.stringify(
      {
        buildings: 2128,
        patches: patches.length,
        samples,
        meanMs: samples.slice(2).reduce((a, b) => a + b, 0) / 5,
        hashes,
        note: 'Authored eight-phase daily-style patch stream; seven independent merges, mean of runs 3–7. Includes Map/output allocation; excludes fixture, final structuredClone, hashing, IPC/GPU. Complete simulation measured separately.',
      },
      null,
      2,
    ) + '\n',
  );
});
