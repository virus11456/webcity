import { RoadGraph } from '../../src/world/roadGraph';
import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { updatePopulation } from '../../src/sim/systems/population';
import {
  CitizenSystem,
  citizenBytes,
  citizenSystem,
} from '../../src/sim/systems/citizens';
import { Simulation } from '../../src/sim/simulation';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { initialHousing } from '../../src/world/population';
import {
  createCitizens,
  reserveCitizens,
  removeCitizen,
} from '../../src/world/citizens';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import type { Building } from '../../src/world/types';
const settings = {
  seed: 72,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Citizens',
};
function fixture(people = 100) {
  const s = createState(settings),
    base = districtFixture(1)[0]!;
  const home: Building = {
    ...structuredClone(base),
    id: 1,
    defId: 'RH',
    state: 'active',
    level: 5,
    lotW: 4,
    lotD: 4,
    pos: { x: 0, z: 0 },
    residents: people,
    households: Math.ceil(people / 5),
  };
  home.housing = initialHousing(home, 90);
  s.buildings = [
    home,
    {
      ...structuredClone(base),
      id: 2,
      defId: 'I',
      state: 'active',
      level: 1,
      lotW: 4,
      lotD: 4,
      pos: { x: 60, z: 0 },
      residents: 0,
      households: 0,
    },
  ];
  const roads = new RoadGraph(100);
  roads.addRoad({
    start: { x: -100, z: -9 },
    end: { x: 200, z: -9 },
    type: 'road_small',
    startHeight: 60,
    endHeight: 60,
    builtDay: 0,
  });
  Object.assign(s, roads.snapshot());
  updatePopulation(s);
  return s;
}
function snapshot(s: ReturnType<typeof fixture>) {
  return {
    ...structuredClone(s),
    terrain: {
      heights: s.terrain.heights,
      river: s.terrain.river,
      riverWidth: s.terrain.riverWidth,
      revision: s.terrain.revision,
      resources: s.terrain.resources,
    },
  };
}
describe('persistent citizen identity and actual vacancies', () => {
  it('migrates old households once, retains qualified jobs and uses real public-sector slots', () => {
    const s = fixture(),
      c = s.citizens;
    expect(c.count).toBe(100);
    const before = structuredClone(c);
    s.buildings.push({
      ...structuredClone(s.buildings[1]!),
      id: 3,
      kind: 'service',
      defId: 'clinic',
      pos: { x: 1, z: 0 },
    });
    updatePopulation(s);
    for (let i = 0; i < c.count; i++)
      if (before.workId[i]) {
        expect(c.workId[i]).toBe(before.workId[i]);
        expect(c.shiftId[i]).toBe(before.shiftId[i]);
      }
    for (let i = 0; i < c.count; i++)
      if (c.workId[i])
        expect(c.education[i]!).toBeGreaterThanOrEqual(c.requiredEducation[i]!);
    expect(s.buildings.every((b) => b.workers <= b.jobs)).toBe(true);
    s.buildings = s.buildings.filter((b) => b.id !== 2);
    updatePopulation(s);
    expect([...c.workId.slice(0, c.count)]).not.toContain(2);
    expect([...c.id.slice(0, c.count)]).toEqual([
      ...before.id.slice(0, before.count),
    ]);
  });
  it('round-trips typed data and resumes with identical assignments and deterministic lifetimes', async () => {
    const s = fixture(),
      original = snapshot(s);
    const decoded = await deserialize(await serialize(original));
    expect(decoded.citizens).toEqual(original.citizens);
    const a = new Simulation(settings, undefined, original),
      b = new Simulation(settings, undefined, decoded);
    for (let i = 0; i < 320; i++) {
      a.tick();
      b.tick();
    }
    expect(a.snapshot().citizens).toEqual(b.snapshot().citizens);
    expect(a.snapshot().buildings).toEqual(b.snapshot().buildings);
  });
  it('accepts legacy empty arrays but rejects corrupt identities, lengths, ages and cross-home families', () => {
    const original = snapshot(fixture());
    const legacy = structuredClone(original);
    Object.assign(legacy, { citizens: [] });
    const migrated = migrateSave(legacy, 1);
    expect(
      new Simulation(settings, undefined, migrated).snapshot().citizens.count,
    ).toBe(100);
    for (const breakSave of [
      (s: typeof original) => {
        s.citizens.id[1] = s.citizens.id[0]!;
      },
      (s: typeof original) => {
        s.citizens.age = new Uint8Array(0);
      },
      (s: typeof original) => {
        s.citizens.age[0] = 101;
      },
      (s: typeof original) => {
        s.citizens.homeId[1] = 2;
      },
      (s: typeof original) => {
        s.citizens.workId[0] = 9000;
      },
    ]) {
      const corrupt = structuredClone(original);
      breakSave(corrupt);
      expect(() => migrateSave(corrupt, 1)).toThrow('Invalid save');
    }
  });
  it('compacts every SoA column and preserves stable IDs', () => {
    const c = createCitizens();
    reserveCitizens(c, 3);
    c.count = 3;
    c.id.set([1, 2, 3]);
    c.homeId.set([10, 20, 30]);
    c.age.set([20, 30, 40]);
    removeCitizen(c, 1);
    expect(c.count).toBe(2);
    expect([...c.id.slice(0, 2)]).toEqual([1, 3]);
    expect(c.homeId[1]).toBe(30);
    expect(c.age[1]).toBe(40);
  });
});
describe('life and education', () => {
  it('births and deaths change actual household size, never reappear on reconciliation; same day is idempotent', () => {
    const s = fixture(50),
      c = s.citizens;
    c.age.fill(99, 0, c.count);
    c.bornDay.fill(0);
    s.clock.day = 30;
    const life = citizenSystem(s).daily();
    expect(life.deaths).toBe(50);
    updatePopulation(s);
    expect(c.count).toBe(0);
    expect(s.stats.population).toBe(0);
    expect(citizenSystem(s).daily()).toEqual({ births: 0, deaths: 0 });
    const births = fixture(50);
    const h = births.buildings[0]!.housing!;
    h.sizes = [50, 0, 0, 0, 0];
    updatePopulation(births);
    births.citizens.age.fill(32, 0, births.citizens.count);
    let born = 0;
    for (let day = 30; day <= 600; day += 30) {
      births.clock.day = day;
      born += citizenSystem(births).daily().births;
      updatePopulation(births);
    }
    expect(born).toBeGreaterThan(0);
    expect(births.citizens.count).toBe(50 + born);
    expect(h.sizes.reduce((n, count, i) => n + count * (i + 1), 0)).toBe(
      births.citizens.count,
    );
  });
  it('retires workers at 65 and never upgrades education without an allocated active school', () => {
    const s = fixture(),
      c = s.citizens;
    c.age.fill(64, 0, c.count);
    c.bornDay.fill(0);
    s.clock.day = 30;
    citizenSystem(s).daily();
    updatePopulation(s);
    expect([...c.workId.slice(0, c.count)].every((id) => id === 0)).toBe(true);
    const pupils = fixture(50),
      table = pupils.citizens;
    table.age.fill(6, 0, table.count);
    table.education.fill(0);
    table.workId.fill(0);
    for (let day = 1; day <= 30; day++) {
      pupils.clock.day = day;
      citizenSystem(pupils).daily();
    }
    expect(
      [...table.education.slice(0, table.count)].every((e) => e === 0),
    ).toBe(true);
    pupils.buildings.push({
      ...structuredClone(pupils.buildings[1]!),
      id: 3,
      kind: 'service',
      defId: 'school_elementary',
    });
    updatePopulation(pupils);
    expect(
      [...table.schoolId.slice(0, table.count)].every((id) => id === 3),
    ).toBe(true);
    for (let day = 31; day <= 60; day++) {
      pupils.clock.day = day;
      citizenSystem(pupils).daily();
    }
    expect(
      [...table.education.slice(0, table.count)].every((e) => e === 1),
    ).toBe(true);
  });
  it('caps school enrollment and does not teach pupils after school demolition', () => {
    const s = fixture(400),
      c = s.citizens;
    c.age.fill(6, 0, c.count);
    c.education.fill(0);
    c.workId.fill(0);
    s.buildings.push({
      ...structuredClone(s.buildings[1]!),
      id: 3,
      kind: 'service',
      defId: 'school_elementary',
    });
    updatePopulation(s);
    expect(
      [...c.schoolId.slice(0, c.count)].filter((id) => id === 3),
    ).toHaveLength(300);
    s.buildings.pop();
    updatePopulation(s);
    s.clock.day = 30;
    citizenSystem(s).daily();
    expect([...c.schoolId.slice(0, c.count)].every((id) => id === 0)).toBe(
      true,
    );
    expect([...c.education.slice(0, c.count)].every((e) => e === 0)).toBe(true);
  });
});
it('100k citizen memory and daily lifetime budget', () => {
  const s = fixture(0);
  s.buildings = [];
  s.citizens = createCitizens(100000);
  const c = s.citizens;
  c.count = 100000;
  c.nextId = 100001;
  c.nextHouseholdId = 20001;
  for (let i = 0; i < c.count; i++) {
    c.id[i] = i + 1;
    c.homeId[i] = 1;
    c.householdId[i] = Math.floor(i / 5) + 1;
    c.age[i] = 32;
    c.bornDay[i] = i % 30;
  }
  const system = new CitizenSystem(s);
  const samples: number[] = [];
  for (let day = 31; day < 71; day++) {
    s.clock.day = day;
    const start = performance.now();
    system.daily();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(
    '100k citizen bytes / daily p95 ms',
    citizenBytes(c),
    samples[Math.floor(samples.length * 0.95)],
  );
  expect(c.count).toBe(100000);
  expect(citizenBytes(c)).toBeLessThan(20 * 1024 * 1024);
  expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(10);
});

it('keeps employment summaries separate for adjacent Int32 workplace IDs and all education tiers', () => {
  const s = fixture(100),
    c = s.citizens,
    work = s.buildings[1]!;
  work.id = 0x7ffffffe;
  work.lotW = work.lotD = 2;
  s.buildings.push({
    ...structuredClone(work),
    id: 0x7fffffff,
    pos: { x: 100, z: 0 },
  });
  for (let i = 0; i < c.count; i++) {
    c.age[i] = 25;
    c.education[i] = i % 4;
    c.workId[i] = 0;
  }
  new CitizenSystem(s).reconcile();
  const assignments = s.buildings[0]!.housing!.assignments;
  expect(new Set(assignments.map((a) => a.workplaceId)).size).toBe(2);
  const expected = new Map<string, number>();
  for (let i = 0; i < c.count; i++)
    if (c.workId[i]) {
      const key = `${c.workId[i]}:${c.education[i]}:${c.requiredEducation[i]}`;
      expected.set(key, (expected.get(key) ?? 0) + 1);
    }
  expect(
    new Map(
      assignments.map((a) => [
        `${a.workplaceId}:${a.education}:${a.requiredEducation}`,
        a.workers,
      ]),
    ),
  ).toEqual(expected);
});
