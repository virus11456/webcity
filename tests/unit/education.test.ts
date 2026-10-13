import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { CitizenSystem } from '../../src/sim/systems/citizens';
import { updateEducationSummary } from '../../src/sim/systems/education';
import { updatePopulation } from '../../src/sim/systems/population';
import { initialHousing } from '../../src/world/population';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { serialize, deserialize } from '../../src/save/serializer';
import { educationCity } from '../fixtures/educationCity';
import { migrateSave } from '../../src/save/migrations';
import { Simulation } from '../../src/sim/simulation';
function fixture(people = 400, level = 0) {
  const s = createState({
    seed: 72,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: 'Education',
  });
  const home = {
    ...structuredClone(districtFixture(1)[0]!),
    id: 1,
    defId: 'RH',
    level: 5,
    state: 'active' as const,
    pos: { x: 0, z: 9 },
    lotW: 4,
    lotD: 4,
    residents: people,
    households: people / 5,
  };
  home.housing = initialHousing(home, 90);
  const school = {
    ...structuredClone(home),
    id: 2,
    defId: ['school_elementary', 'school_high', 'university'][level]!,
    kind: 'service' as const,
    pos: { x: 60, z: 9 },
    residents: 0,
    households: 0,
    housing: undefined,
    enabled: true,
  };
  s.buildings = [home, school];
  const roads = new RoadGraph(100);
  roads.addRoad({
    start: { x: -100, z: 0 },
    end: { x: 200, z: 0 },
    type: 'road_small',
    startHeight: 60,
    endHeight: 60,
    builtDay: 0,
  });
  Object.assign(s, roads.snapshot());
  updatePopulation(s);
  s.citizens.age.fill([6, 13, 19][level]!);
  s.citizens.education.fill(level);
  s.citizens.schoolId.fill(0);
  s.citizens.bornDay.fill(0);
  s.citizens.schoolDays.fill(29);
  const system = new CitizenSystem(s);
  system.reconcile();
  return { s, home, school, system, c: s.citizens };
}
describe('road-based education and effective school places', () => {
  it('browser save fixture passes production validation', async () => {
    const f = await educationCity();
    expect(
      (await deserialize(new Uint8Array(f.data).buffer)).citizens.count,
    ).toBe(20);
  });
  it('graduates only admitted students; overflow retains its progress and education', () => {
    const { s, system, c, home, school } = fixture();
    updateEducationSummary(s);
    expect(home.education).toEqual({ enrolled: 300, eligible: 400 });
    expect(school.education).toEqual({
      enrolled: 300,
      eligible: 300,
      capacity: 300,
    });
    s.clock.day = 1;
    system.daily();
    system.reconcile();
    expect(
      [...c.education.slice(0, c.count)].filter((e) => e === 1),
    ).toHaveLength(300);
    expect(
      [...c.schoolDays.slice(0, c.count)].filter((d) => d === 29),
    ).toHaveLength(100);
    expect(
      [...c.schoolId.slice(0, c.count)].filter((id) => id === 2),
    ).toHaveLength(100);
  });
  it('budget reductions deterministically preserve the oldest IDs and suspend excluded pupils', () => {
    const { s, system, c } = fixture();
    s.budgets.education = 0.5;
    s.clock.day = 1;
    system.daily();
    expect([...c.education.slice(0, 150)]).toEqual(Array(150).fill(1));
    expect([...c.education.slice(150, 400)]).toEqual(Array(250).fill(0));
    expect(c.schoolDays[399]).toBe(29);
  });
  it('disabled or disconnected schools cannot advance a day; reopening resumes preserved progress', () => {
    const { s, system, c, school } = fixture(10);
    school.enabled = false;
    s.clock.day = 1;
    system.daily();
    system.reconcile();
    expect(c.schoolDays[0]).toBe(29);
    expect(school.jobs).toBe(0);
    school.enabled = true;
    const segments = s.segments;
    s.segments = [];
    s.clock.day = 2;
    system.daily();
    expect(c.education[0]).toBe(0);
    s.segments = segments;
    s.clock.day = 3;
    system.daily();
    expect(c.education[0]).toBe(1);
  });
  it('nearby homes across an unconnected road cannot enroll', () => {
    const { s, system, c, school } = fixture(10);
    school.pos.z = 109;
    const roads = new RoadGraph(200);
    for (const z of [0, 100])
      roads.addRoad({
        start: { x: -100, z },
        end: { x: 200, z },
        type: 'road_small',
        startHeight: 60,
        endHeight: 60,
        builtDay: 0,
      });
    Object.assign(s, roads.snapshot());
    system.reconcile();
    expect([...c.schoolId.slice(0, 10)]).toEqual(Array(10).fill(0));
  });
  it('all three levels require completed schooling and university graduates can fill qualified jobs', () => {
    for (const level of [0, 1, 2]) {
      const { s, system, c } = fixture(10, level);
      s.clock.day = 1;
      system.daily();
      system.reconcile();
      expect([...c.education.slice(0, 10)]).toEqual(Array(10).fill(level + 1));
      if (level === 2) {
        expect([...c.workId.slice(0, 10)].every((id) => id === 2)).toBe(true);
        expect([...c.requiredEducation.slice(0, 10)].every((e) => e <= 3)).toBe(
          true,
        );
        expect([...c.requiredEducation.slice(0, 10)].some((e) => e === 3)).toBe(
          true,
        );
      }
    }
  });
  it('rejects impossible attendance summaries while accepting old saves without them', () => {
    const { s } = fixture(10);
    const snapshot = new Simulation(s.settings, undefined, s).snapshot();
    for (const summary of [
      { enrolled: -1, eligible: 10 },
      { enrolled: 11, eligible: 10 },
      { enrolled: 10, eligible: 10, capacity: 9 },
      { enrolled: 1.5, eligible: 10 },
    ]) {
      const bad = structuredClone(snapshot);
      bad.buildings[0]!.education = summary;
      expect(() => migrateSave(bad, 1)).toThrow('Invalid save');
    }
    for (const b of snapshot.buildings) delete b.education;
    expect(migrateSave(snapshot, 1).citizens.count).toBe(10);
  });
  it('save reload preserves wait-list progress and reconstructs attendance without granting a diploma', async () => {
    const { s, school } = fixture(10);
    school.enabled = false;
    const snapshot = new Simulation(s.settings, undefined, s).snapshot();
    const loaded = new Simulation(
      s.settings,
      undefined,
      await deserialize(await serialize(snapshot)),
    ).snapshot();
    expect(loaded.citizens.schoolDays[0]).toBe(29);
    expect(loaded.citizens.education[0]).toBe(0);
    expect(loaded.buildings[1]!.education).toEqual({
      enrolled: 0,
      eligible: 0,
      capacity: 0,
    });
  });
});

it('shares home school choices without sharing personal admissions or retaining stale choices', () => {
  const { s, c, school, system } = fixture();
  s.buildings.push({
    ...structuredClone(school),
    id: 3,
    pos: { x: -60, z: 9 },
  });
  c.schoolId.fill(0);
  system.reconcile();
  expect([...c.schoolId.slice(0, 300)]).toEqual(Array(300).fill(2));
  expect([...c.schoolId.slice(300, 400)]).toEqual(Array(100).fill(3));
  c.education.fill(1, 0, 20);
  c.age.fill(13, 0, 20);
  s.buildings.push({
    ...structuredClone(school),
    id: 4,
    defId: 'school_high',
    pos: { x: 30, z: 9 },
  });
  system.reconcile();
  expect([...c.schoolId.slice(0, 20)]).toEqual(Array(20).fill(4));
  school.pos.x = 120;
  system.reconcile();
  expect([...c.schoolId.slice(20, 300)]).toEqual(Array(280).fill(2));
  school.enabled = false;
  system.reconcile();
  expect([...c.schoolId.slice(20, 220)]).toEqual(Array(200).fill(3));
  expect([...c.schoolId.slice(220, 300)]).toEqual(Array(80).fill(0));
  expect([...c.schoolId.slice(300, 400)]).toEqual(Array(100).fill(3));
  s.budgets.education = 0.5;
  system.reconcile();
  expect([...c.schoolId.slice(20, 170)]).toEqual(Array(150).fill(3));
  expect([...c.schoolId.slice(170, 400)]).toEqual(Array(230).fill(0));
  s.segments = [];
  system.reconcile();
  expect([...c.schoolId.slice(0, 400)]).toEqual(Array(400).fill(0));
});

it('reserves existing pupils before lower-ID newcomers even when both schools have the same distance', () => {
  const { s, c, school } = fixture();
  c.schoolId.fill(0, 0, c.count);
  c.schoolId.fill(school.id, 300, 400);
  s.budgets.education = 0.2;
  s.buildings.push({ ...structuredClone(school), id: 3 });
  new CitizenSystem(s).reconcile();
  expect([...c.schoolId.slice(300, 360)]).toEqual(Array(60).fill(2));
  expect([...c.schoolId.slice(0, 60)]).toEqual(Array(60).fill(3));
  expect([...c.schoolId.slice(60, 300)]).toEqual(Array(240).fill(0));
  expect([...c.schoolId.slice(360, 400)]).toEqual(Array(40).fill(0));
});

it('separates all three education levels while retaining valid original schools and replacing mismatches', () => {
  const { s, c, school } = fixture(30);
  for (const [id, defId] of [
    [5, 'university'],
    [4, 'school_high'],
    [3, 'school_elementary'],
  ] as const)
    s.buildings.push({
      ...structuredClone(school),
      id,
      defId,
      pos: { x: -30, z: 9 },
    });
  c.education.fill(0, 0, 10);
  c.age.fill(6, 0, 10);
  c.education.fill(1, 10, 20);
  c.age.fill(13, 10, 20);
  c.education.fill(2, 20, 30);
  c.age.fill(19, 20, 30);
  c.schoolId.fill(2, 0, 30);
  c.schoolId[0] = 0;
  new CitizenSystem(s).reconcile();
  expect(c.schoolId[0]).toBe(3);
  expect([...c.schoolId.slice(1, 10)]).toEqual(Array(9).fill(2));
  expect([...c.schoolId.slice(10, 20)]).toEqual(Array(10).fill(4));
  expect([...c.schoolId.slice(20, 30)]).toEqual(Array(10).fill(5));
  s.buildings.find((b) => b.id === 4)!.enabled = false;
  new CitizenSystem(s).reconcile();
  expect([...c.schoolId.slice(10, 20)]).toEqual(Array(10).fill(0));
});

it('keeps per-school seat limits for interleaved original-school reservations', () => {
  const { s, c, school } = fixture(30);
  s.buildings.push({ ...structuredClone(school), id: 3 });
  for (const b of s.buildings) if (b.kind === 'service') b.pos.x = 0;
  s.budgets.education = 0.02; // Six seats per school, with the home inside the scaled radius.
  for (let i = 0; i < c.count; i++) c.schoolId[i] = i % 2 ? 3 : 2;
  new CitizenSystem(s).reconcile();
  expect([...c.schoolId.slice(0, 12)]).toEqual(
    Array.from({ length: 12 }, (_, i) => (i % 2 ? 3 : 2)),
  );
  expect([...c.schoolId.slice(12, 30)]).toEqual(Array(18).fill(0));
});

it('does not reuse a reach answer for a different education level at the same home', () => {
  const { s, c, school } = fixture(30);
  s.buildings.push(
    { ...structuredClone(school), id: 3, defId: 'school_high' },
    { ...structuredClone(school), id: 4, defId: 'university' },
  );
  for (let i = 0; i < c.count; i++) {
    const level = (i + 1) % 3;
    c.education[i] = level;
    c.age[i] = [6, 13, 19][level]!;
    c.schoolId[i] = school.id;
  }
  new CitizenSystem(s).reconcile();
  expect([...c.schoolId.slice(0, c.count)]).toEqual(
    Array.from({ length: 30 }, (_, i) => 2 + ((i + 1) % 3)),
  );
});

it('separates home reach and recomputes it after moving homes, removing roads and restoring roads', () => {
  const { s, home, school } = fixture(30);
  const farHome = {
    ...structuredClone(home),
    id: 10,
    pos: { x: 0, z: 500 },
  };
  s.buildings.push(farHome);
  new CitizenSystem(s).reconcile();
  const c = s.citizens;
  expect(c.count).toBe(60);
  c.education.fill(0, 0, c.count);
  c.age.fill(6, 0, c.count);
  c.schoolId.fill(school.id, 0, c.count);
  const system = new CitizenSystem(s);
  system.reconcile();
  for (let i = 0; i < c.count; i++)
    expect(c.schoolId[i]).toBe(c.homeId[i] === home.id ? school.id : 0);
  farHome.pos.z = 9;
  system.reconcile();
  expect([...c.schoolId.slice(0, c.count)]).toEqual(Array(60).fill(school.id));
  const roads = s.segments;
  s.segments = [];
  system.reconcile();
  expect([...c.schoolId.slice(0, c.count)]).toEqual(Array(60).fill(0));
  s.segments = roads;
  system.reconcile();
  expect([...c.schoolId.slice(0, c.count)]).toEqual(Array(60).fill(school.id));
});
