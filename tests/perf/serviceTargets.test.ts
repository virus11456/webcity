import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performanceCity } from '../fixtures/performanceCity';
import { RoadGraph } from '../../src/world/roadGraph';
import { ServiceSystem } from '../../src/sim/systems/services';

test('measure mixed services on a connected 100k city road grid', () => {
  const s = performanceCity(),
    graph = new RoadGraph();
  for (let row = 0; row < 32; row++)
    graph.addRoad({
      start: { x: -1056, z: row * 64 - 1048 },
      end: { x: 1056, z: row * 64 - 1048 },
      type: 'road_large',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  for (const x of [-1056, 0, 1056])
    graph.addRoad({
      start: { x, z: -1048 },
      end: { x, z: 936 },
      type: 'road_large',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  const roads = graph.snapshot();
  s.nodes = roads.nodes;
  s.segments = roads.segments;
  for (const b of s.buildings) b.frontageSetbackM = 8;
  const base = s.buildings[0]!,
    definitions = [
      'school_elementary',
      'school_high',
      'university',
      'police_station',
      'fire_station',
      'clinic',
    ];
  for (let i = 0; i < 96; i++)
    s.buildings.push({
      ...structuredClone(base),
      id: s.nextId++,
      defId: definitions[i % definitions.length]!,
      kind: 'service',
      pos: { x: ((i % 3) - 1) * 640, z: Math.floor(i / 3) * 64 - 1024 },
      housing: undefined,
      households: 0,
      residents: 0,
      jobs: 0,
      workers: 0,
    });
  const services = new ServiceSystem(s),
    samples: number[] = [],
    hashes: string[] = [];
  for (let run = 0; run < 7; run++) {
    for (const type of ['education', 'police', 'fire', 'health'] as const)
      s.budgets[type] = 0.5 + run * 0.1;
    const start = performance.now();
    const patches = services.update();
    samples.push(performance.now() - start);
    const hash = createHash('sha256').update(
      JSON.stringify({ buildings: s.buildings, patches }),
    );
    for (const field of Object.values(s.fields.coverage))
      hash.update(
        new Uint8Array(field.buffer, field.byteOffset, field.byteLength),
      );
    hashes.push(hash.digest('hex'));
  }
  expect(s.citizens.count).toBe(100000);
  expect(s.buildings.some((b) => (b.coverage?.police ?? 0) > 0)).toBe(true);
  expect(s.buildings.some((b) => (b.coverage?.education ?? 0) > 0)).toBe(true);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/service-target-performance.json',
    JSON.stringify(
      {
        population: s.citizens.count,
        roads: s.segments.length,
        buildings: s.buildings.length,
        providers: 96,
        samples,
        meanMs: samples.slice(2).reduce((a, b) => a + b, 0) / 5,
        hashes,
        note: 'Authored 100k city with 32 horizontal roads joined by three vertical roads and 96 mixed providers. Seven updates with budgets 0.5–1.1; mean of runs 3–7. Includes service coverage/demand and raster, excludes fixture/network construction and hashing; not full simulation or GPU.',
      },
      null,
      2,
    ) + '\n',
  );
}, 120000);
