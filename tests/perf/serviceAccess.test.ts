import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performanceCity } from '../fixtures/performanceCity';
import { ServiceNetwork } from '../../src/world/services';

test('measure cold service network construction and long-road access queries', () => {
  const s = performanceCity();
  const samples: { buildMs: number; queryMs: number }[] = [];
  const hashes: string[] = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    const network = new ServiceNetwork(s.nodes, s.segments);
    const built = performance.now();
    const results = s.buildings.map((b) => network.access(b.pos, 8));
    const queried = performance.now();
    samples.push({ buildMs: built - start, queryMs: queried - built });
    expect(results.some((r) => r !== undefined)).toBe(true);
    hashes.push(
      createHash('sha256').update(JSON.stringify(results)).digest('hex'),
    );
  }
  expect(new Set(hashes).size).toBe(1);
  const report = {
    roads: s.segments.length,
    queries: s.buildings.length,
    samples,
    buildMeanMs: samples.slice(2).reduce((a, s) => a + s.buildMs, 0) / 5,
    queryMeanMs: samples.slice(2).reduce((a, s) => a + s.queryMs, 0) / 5,
    resultSha256: hashes[0],
    note: 'Seven independent ServiceNetwork constructions; means use runs 3–7. Authored 32 long disconnected roads and all building access queries, not a full natural city or a memory gate.',
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/service-access-performance.json',
    JSON.stringify(report, null, 2),
  );
}, 120000);
