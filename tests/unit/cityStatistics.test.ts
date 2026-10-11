import { describe, it, expect } from 'vitest';
import { cityStatistics } from '../../src/world/cityStatistics';
import { trafficCity } from '../fixtures/trafficCity';
import { deserialize, serialize } from '../../src/save/serializer';
import { WorldMirror } from '../../src/bridge/mirror';
import { createState } from '../../src/sim/state';
describe('city statistics', () => {
  it('uses actual citizen ages and education, with workers as the unemployment denominator', async () => {
    const f = await trafficCity(64),
      s = await deserialize(Uint8Array.from(f.data).buffer);
    const v = cityStatistics(s.buildings, s.stats, []);
    const ages = [0, 0, 0, 0],
      education = [0, 0, 0, 0];
    for (let i = 0; i < s.citizens.count; i++) {
      const age = s.citizens.age[i]!;
      ages[age <= 12 ? 0 : age <= 18 ? 1 : age <= 64 ? 2 : 3]!++;
      education[s.citizens.education[i]!]!++;
    }
    expect(v.ages).toEqual(ages);
    expect(v.education).toEqual(education);
    expect(v.population).toBe(s.citizens.count);
    expect(v.unemployment).toBe(
      s.stats.populationDetails!.unemployed /
        s.stats.populationDetails!.availableWorkers,
    );
    expect(v.employed + v.unemployed).toBe(v.availableWorkers);
    const restored = await deserialize(await serialize(s));
    expect(cityStatistics(restored.buildings, restored.stats, [])).toEqual(v);
  });
  it('weights measured road speeds by current vehicle count, excludes empty roads, and clears on new city', () => {
    const s = createState({
        seed: 42,
        mapId: 'valley',
        mode: 'sandbox',
        cityName: 'Stats',
      }),
      m = new WorldMirror();
    m.apply({ t: 'ready', reqId: 1, snapshot: s });
    expect(m.readCityStatistics()).toMatchObject({
      vehicles: 0,
      speedKmh: null,
      flow: null,
      unemployment: null,
    });
    m.apply({
      t: 'roadTraffic',
      roads: [
        { id: 1, count: 3, speedKmh: 10, ratio: 0.2 },
        { id: 2, count: 1, speedKmh: 30, ratio: 0.6 },
        { id: 3, count: 0, speedKmh: 120, ratio: 1 },
      ],
    });
    expect(m.readCityStatistics()).toMatchObject({
      vehicles: 4,
      speedKmh: 15,
      blocked: 1,
    });
    expect(m.readCityStatistics()!.flow).toBeCloseTo(0.3);
    const view = m.readCityStatistics()!;
    view.ages[0] = 999;
    expect(m.readCityStatistics()!.ages[0]).toBe(0);
    m.apply({
      t: 'roadsChanged',
      added: [],
      removed: [1],
      nodes: [],
      removedNodes: [],
    });
    expect(m.readCityStatistics()).toMatchObject({
      vehicles: 1,
      speedKmh: 30,
      blocked: 0,
    });
    m.apply({ t: 'ready', reqId: 2, snapshot: s });
    expect(m.readCityStatistics()!.vehicles).toBe(0);
  });
});
