import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { updatePopulation } from '../../src/sim/systems/population';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { citizenSystem } from '../../src/sim/systems/citizens';
import { Simulation } from '../../src/sim/simulation';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { initialHousing } from '../../src/world/population';
import { CitizenState } from '../../src/world/citizens';
import {
  JourneyPurpose as Purpose,
  JourneyStatus as Status,
  hourTicks,
  mobilityHour,
  representativeCitizen,
  type Journey,
} from '../../src/world/schedules';
import { SCHEDULES } from '../../src/data/schedules';
import { migrateSave } from '../../src/save/migrations';
import { serialize, deserialize } from '../../src/save/serializer';
import type { Building } from '../../src/world/types';
const settings = {
  seed: 72,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Schedules',
};
function fixture(shift = 0, distance = 200) {
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
    residents: 100,
    households: 20,
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
      pos: { x: distance, z: 0 },
      residents: 0,
      households: 0,
    },
  ];
  s.nextId = 10;
  updatePopulation(s);
  const c = s.citizens;
  c.shiftId.fill(shift);
  return {
    s,
    system: new ScheduleSystem(s),
    worker: [...c.workId.slice(0, c.count)].findIndex((id) => !!id),
  };
}
function at(f: ReturnType<typeof fixture>, hour: number) {
  f.s.clock.ticks = hourTicks(hour);
  f.system.tick();
}
function tripFor(f: ReturnType<typeof fixture>, i: number): Journey {
  const request = f.system
    .pending(1000)
    .find((j) => j.citizenId === f.s.citizens.id[i]);
  expect(request).toBeDefined();
  return request!;
}
describe('personal daily itinerary', () => {
  it.each([0, 1, 2])(
    'shift %i travels to its own workplace, works, returns to its original home and rests',
    (shift) => {
      const f = fixture(shift),
        c = f.s.citizens,
        i = f.worker;
      const start = SCHEDULES.shiftStartHours[shift]!;
      at(f, start + 3);
      const outward = tripFor(f, i);
      expect(outward).toMatchObject({
        originId: 1,
        destinationId: 2,
        purpose: Purpose.work,
        mode: 0,
      });
      expect(f.system.arrive(outward)).toBe(false); // Requests never teleport.
      expect(c.locationId[i]).toBe(1);
      expect(f.system.depart(outward)).toBe(true);
      expect(f.system.depart(outward)).toBe(false);
      at(f, start + 4);
      expect(f.system.arrive(outward)).toBe(true);
      expect(c.state[i]).toBe(CitizenState.working);
      at(f, start + 14);
      const returning = tripFor(f, i);
      expect(returning).toMatchObject({
        originId: 2,
        destinationId: 1,
        purpose: Purpose.home,
      });
      f.system.depart(returning);
      at(f, start + 15);
      expect(f.system.arrive(returning)).toBe(true);
      expect(c.locationId[i]).toBe(1);
      expect(c.state[i]).toBe(CitizenState.sleeping);
      at(f, start + 16);
      expect(c.state[i]).toBe(CitizenState.sleeping);
    },
  );
  it('never resets unfinished travel at fiscal boundaries or midnight, and stale arrival cannot complete a replacement request', () => {
    const f = fixture(0, 800),
      c = f.s.citizens,
      i = f.worker;
    at(f, 9);
    const j = tripFor(f, i);
    expect(j.mode).toBe(1);
    f.system.depart(j);
    for (let h = 10; h < 73; h++) {
      at(f, h);
      expect(c.locationId[i]).toBe(1);
      expect(c.tripStatus[i]).toBe(Status.moving);
    }
    expect(f.system.arrive(j)).toBe(true);
    expect(c.activityUntilTick[i]!).toBeGreaterThan(f.s.clock.ticks);
    at(f, 76);
    const back = tripFor(f, i);
    expect(f.system.arrive(j)).toBe(false);
    expect(back.destinationId).toBe(1);
    expect(c.locationId[i]).toBe(2);
  });
  it('unemployed residents have no work trips, and each home/work pair remains distinct under visibility sampling', () => {
    const f = fixture(),
      c = f.s.citizens;
    at(f, 9);
    const trips = f.system.pending(1000);
    expect(trips.length).toBeGreaterThan(0);
    for (const t of trips) {
      const i = citizenSystem(f.s).indexOf(t.citizenId)!;
      expect(c.workId[i]).toBe(t.destinationId);
      expect(c.homeId[i]).toBe(t.originId);
    }
    const noJob = [...c.workId.slice(0, c.count)].flatMap((id, i) =>
      id ? [] : [c.id[i]!],
    );
    expect(trips.every((j) => !noJob.includes(j.citizenId))).toBe(true);
    expect(
      Array.from({ length: 100 }, (_, i) =>
        representativeCitizen(i + 1, 'desktop'),
      ).filter(Boolean),
    ).toHaveLength(25);
    expect(
      Array.from({ length: 100 }, (_, i) =>
        representativeCitizen(i + 1, 'iphone'),
      ).filter(Boolean),
    ).toHaveLength(10);
  });
  it('retains blocked journeys for bounded retries and rejects arrival after a destination is demolished', () => {
    const f = fixture(),
      c = f.s.citizens;
    at(f, 9);
    const j = tripFor(f, f.worker);
    f.system.blocked(j);
    expect(
      f.system.pending(1000).some((t) => t.citizenId === j.citizenId),
    ).toBe(false);
    f.s.clock.ticks += SCHEDULES.retryTicks;
    const retry = tripFor(f, f.worker);
    expect(retry.destinationId).toBe(2);
    f.system.depart(retry);
    f.s.buildings = f.s.buildings.filter((b) => b.id !== 2);
    f.system.tick();
    expect(f.system.arrive(retry)).toBe(false);
    expect(c.locationId[f.worker]).toBe(1);
  });
  it('morning and evening request peaks exceed other times, with short acknowledgement-driven trips', () => {
    const f = fixture(),
      hist = new Array<number>(24).fill(0),
      moving = new Map<number, { j: Journey; at: number }>();
    for (let tick = 0; tick < SCHEDULES.ticksPerDay; tick++) {
      f.s.clock.ticks = tick;
      f.system.tick();
      for (const [id, trip] of moving)
        if (tick >= trip.at) {
          f.system.arrive(trip.j);
          moving.delete(id);
        }
      for (const j of f.system.pending(1000)) {
        hist[Math.floor(mobilityHour(tick))]!++;
        f.system.depart(j);
        moving.set(j.citizenId, { j, at: tick + 10 });
      }
    }
    const peak =
      hist.slice(6, 9).reduce((a, n) => a + n, 0) +
      hist.slice(16, 19).reduce((a, n) => a + n, 0);
    const off = hist.reduce((a, n) => a + n, 0) - peak;
    expect(peak / 6).toBeGreaterThan((off / 18) * 3);
  });
  it('save/load preserves a moving journey and pause/speeds share the same absolute mobility clock', async () => {
    const f = fixture();
    at(f, 9);
    const j = tripFor(f, f.worker);
    f.system.depart(j);
    const snapshot = {
      ...structuredClone(f.s),
      terrain: {
        heights: f.s.terrain.heights,
        river: f.s.terrain.river,
        riverWidth: f.s.terrain.riverWidth,
        revision: f.s.terrain.revision,
        resources: f.s.terrain.resources,
      },
    };
    // Keep the fiscal clock coherent for a real worker load.
    snapshot.clock.day = Math.floor(snapshot.clock.ticks / 10);
    snapshot.clock.tickInDay = snapshot.clock.ticks % 10;
    const restored = await deserialize(await serialize(snapshot));
    expect(restored.citizens.tripStatus[f.worker]).toBe(Status.moving);
    const a = new Simulation(settings, undefined, restored);
    a.setSpeed(0);
    const before = a.snapshot().clock.ticks;
    a.advance(250);
    expect(a.snapshot().clock.ticks).toBe(before);
    const end: number[] = [];
    for (const speed of [1, 2, 4] as const) {
      const sim = new Simulation(settings, undefined, restored);
      sim.setSpeed(speed);
      for (let elapsed = 0; elapsed < 2400 / speed; elapsed += 100)
        sim.advance(100);
      end.push(sim.snapshot().clock.ticks);
    }
    expect(new Set(end).size).toBe(1);
  });
});

it('migrates M2-07 tables without journey fields and rejects partially missing schemas', () => {
  const f = fixture();
  const snap = new Simulation(settings).snapshot();
  snap.buildings = f.s.buildings;
  snap.nextId = f.s.nextId;
  snap.citizens = f.s.citizens;
  const legacy = structuredClone(snap);
  for (const field of [
    'locationId',
    'destinationId',
    'tripOriginId',
    'tripStartTick',
    'shiftEndTick',
    'lastShiftCycle',
    'activityUntilTick',
    'lastShoppingCycle',
    'lastLeisureCycle',
    'tripStatus',
    'tripPurpose',
    'travelMode',
    'restAfterTrip',
  ])
    Reflect.deleteProperty(legacy.citizens, field);
  const migrated = migrateSave(legacy, 1);
  expect(migrated.citizens.count).toBe(snap.citizens.count);
  expect(migrated.citizens.restAfterTrip).toHaveLength(snap.citizens.id.length);
  const corrupt = structuredClone(snap);
  Reflect.deleteProperty(corrupt.citizens, 'travelMode');
  expect(() => migrateSave(corrupt, 1)).toThrow();
});
it('school and distinct workplace assignments produce their own requests and removed residents ignore callbacks', () => {
  const f = fixture(),
    c = f.s.citizens;
  f.s.buildings.push({
    ...structuredClone(f.s.buildings[1]!),
    id: 3,
    pos: { x: 800, z: 0 },
    kind: 'service',
    defId: 'school_elementary',
  });
  c.schoolId[0] = 3;
  c.workId[0] = 0;
  c.workId[1] = 3;
  c.schoolId[1] = 0;
  at(f, 9);
  const pupil = tripFor(f, 0),
    other = tripFor(f, 1);
  expect(pupil).toMatchObject({ destinationId: 3, purpose: Purpose.school });
  expect(other).toMatchObject({ destinationId: 3, purpose: Purpose.work });
  f.system.depart(pupil);
  f.s.buildings[0]!.state = 'abandoned';
  updatePopulation(f.s);
  expect(f.system.arrive(pupil)).toBe(false);
});
