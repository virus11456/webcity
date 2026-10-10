import { it, expect } from 'vitest';
import { createState } from '../../src/sim/state';
import { citizenSystem } from '../../src/sim/systems/citizens';
import { updatePopulation } from '../../src/sim/systems/population';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { initialHousing } from '../../src/world/population';
it('conserves labour and jobs at 100,000 residents', () => {
  const s = createState({
      seed: 1,
      mapId: 'valley',
      mode: 'normal',
      cityName: 'Benchmark',
    }),
    base = districtFixture(1)[0]!;
  for (let i = 0; i < 1000; i++) {
    const b = {
      ...structuredClone(base),
      id: i + 1,
      defId: 'RH',
      state: 'active' as const,
      level: 5,
      lotW: 4,
      lotD: 4,
      pos: { x: (i % 32) * 64 - 1024, z: Math.floor(i / 32) * 64 - 1024 },
    };
    b.housing = initialHousing(b, 90);
    b.housing.sizes = [0, 0, 0, 0, 20];
    s.buildings.push(b);
    s.buildings.push({
      ...structuredClone(base),
      id: i + 1001,
      defId: 'I',
      state: 'active',
      level: 1,
      lotW: 4,
      lotD: 4,
      pos: { x: b.pos.x + 32, z: b.pos.z + 32 },
    });
  }
  updatePopulation(s);
  const adults = [...s.citizens.age.slice(0, s.citizens.count)].filter(
    (age) => age >= 19 && age <= 64,
  ).length;
  expect(adults).toBeGreaterThan(54000);
  expect(adults).toBeLessThan(56000);
  expect(s.stats.populationDetails).toMatchObject({
    availableWorkers: adults,
    employed: adults,
    unemployed: 0,
    jobs: 64000,
    vacancies: 64000 - adults,
  });
  expect(s.buildings.every((b) => b.workers <= b.jobs)).toBe(true);
  expect(s.stats.population).toBe(100000);
  const samples: number[] = [];
  for (let day = 1; day <= 35; day++) {
    s.clock.day = day;
    const start = performance.now();
    citizenSystem(s).daily();
    citizenSystem(s).reconcile();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)]!;
  console.log('100k real city daily p95 ms', p95);
  expect(p95).toBeLessThan(10);
});
