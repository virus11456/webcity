import { it, expect } from 'vitest';
import { createState } from '../../src/sim/state';
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
  expect(s.stats.populationDetails).toMatchObject({
    availableWorkers: 55000,
    employed: 55000,
    unemployed: 0,
    jobs: 64000,
    vacancies: 9000,
  });
  expect(s.buildings.every((b) => b.workers <= b.jobs)).toBe(true);
  expect(s.stats.population).toBe(100000);
});
