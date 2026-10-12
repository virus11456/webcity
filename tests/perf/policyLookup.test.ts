import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { POLICIES } from '../../src/data/policies';
import { districtPoint } from '../../src/world/districts';
import { hasPolicy, type PolicyWorld } from '../../src/world/policies';

test('measure mixed city and district policy lookups with zero and 64 districts', () => {
  const reports = [];
  for (const count of [0, 64]) {
    const s: PolicyWorld = {
      policies: ['education_campaign', 'energy_saving'],
      districts: Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `District ${i}`,
        cells: [i],
        policies:
          i % 3 === 0
            ? { education_campaign: false }
            : i % 3 === 1
              ? { recycling_plan: true }
              : {},
      })),
    };
    // Equal shares of each district and unassigned land; point creation is not timed.
    const queries = Array.from({ length: 100000 }, (_, i) => ({
      pos: districtPoint(i % 65),
      id: POLICIES[i % POLICIES.length]!.id,
    }));
    const answers = new Uint8Array(queries.length),
      samples: number[] = [],
      hashes: string[] = [];
    for (let run = 0; run < 7; run++) {
      const start = performance.now();
      for (let i = 0; i < queries.length; i++) {
        const q = queries[i]!;
        answers[i] = Number(hasPolicy(s, q.id, q.pos));
      }
      samples.push(performance.now() - start);
      hashes.push(createHash('sha256').update(answers).digest('hex'));
    }
    expect(new Set(hashes).size).toBe(1);
    expect(answers.some(Boolean)).toBe(true);
    expect(answers.some((v) => !v)).toBe(true);
    reports.push({
      districts: count,
      queries: queries.length,
      samples,
      meanMs: samples.slice(2).reduce((a, b) => a + b, 0) / 5,
      hashes,
    });
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/policy-lookup-performance.json',
    JSON.stringify(
      {
        reports,
        note: '100k authored queries, not a full-city or resident simulation. Seven rounds; mean of rounds 3–7. First round includes district ownership index construction when applicable.',
      },
      null,
      2,
    ) + '\n',
  );
});
