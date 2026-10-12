import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performanceCity } from '../fixtures/performanceCity';
import { parkField } from '../../src/sim/systems/parks';

test('measure park field cold builds, reuse and edits with 4000 trees and 64 parks', () => {
  const s = performanceCity(),
    base = s.buildings[0]!;
  for (let i = 0; i < 4064; i++)
    s.buildings.push({
      ...structuredClone(base),
      id: s.nextId++,
      kind: 'park',
      defId: i < 4000 ? 'tree' : 'park_large',
      pos: { x: (i % 64) * 32 - 1024, z: Math.floor(i / 64) * 32 - 1024 },
      lotW: i < 4000 ? 1 : 4,
      lotD: i < 4000 ? 1 : 4,
      rotation: (i % 7) / 3,
      housing: undefined,
      residents: 0,
      households: 0,
      jobs: 0,
      workers: 0,
    });
  const cold: number[] = [],
    warm: number[] = [],
    hashes: string[] = [];
  for (let run = 0; run < 7; run++) {
    // Changing budget invalidates the retained result without changing geometry or population.
    s.budgets.parks = run % 2 ? 0.81 : 1.23;
    let start = performance.now();
    const first = parkField(s);
    cold.push(performance.now() - start);
    start = performance.now();
    let result = first;
    for (let repeat = 0; repeat < 20; repeat++) result = parkField(s);
    warm.push((performance.now() - start) / 20);
    const digest = (a: Float32Array) =>
      createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex');
    hashes.push(digest(result));
    expect(digest(first)).toBe(hashes.at(-1));
  }
  const mean = (xs: number[]) => xs.slice(2).reduce((a, b) => a + b, 0) / 5;
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/park-field-performance.json',
    JSON.stringify(
      {
        trees: 4000,
        parks: 64,
        cold,
        warm,
        coldMeanMs: mean(cold),
        warmMeanMs: mean(warm),
        resultSha256: hashes,
        note: '300×300 grid; 4000 trees and 64 parks added to 100k CPU fixture. Seven budget changes; each followed by twenty unchanged calls including returned-array copies. Means of runs 3–7; hash outside timer. Single kernel, not full city or memory budget verification.',
      },
      null,
      2,
    ) + '\n',
  );
}, 120000);
