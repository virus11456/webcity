import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { createState } from '../../src/sim/state';
import { updateProblems } from '../../src/sim/systems/problems';
import { updatePopulation } from '../../src/sim/systems/population';
import { GrowthSystem } from '../../src/sim/systems/growth';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import {
  buildingProblemIcons,
  hasBuildingProblem,
} from '../../src/world/buildingProblems';
import { TIME } from '../../src/data/config';
import { PROBLEMS } from '../../src/data/simulation';
import { WorldMirror } from '../../src/bridge/mirror';
import type { Building } from '../../src/world/types';
const settings = {
  seed: 72,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Problems',
};
function fixture(patch: Partial<Building> = {}) {
  const s = createState(settings);
  const b: Building = {
    ...districtFixture(1)[0]!,
    id: 100,
    kind: 'zoned',
    defId: 'RL',
    state: 'active',
    stateTimer: 0,
    flags: 7,
    households: 2,
    residents: 4,
    jobs: 0,
    workers: 0,
    ...patch,
  };
  s.buildings = [b];
  s.stats.population = b.residents;
  const advance = (days: number) => {
    s.clock.ticks = Math.round(days * TIME.ticksPerDay);
    s.clock.day = Math.floor(days);
    s.clock.tickInDay = s.clock.ticks % TIME.ticksPerDay;
    return updateProblems(s);
  };
  return { s, b, advance };
}
describe('continuous problem deadlines', () => {
  it.each([
    ['noPower', { flags: 6 }],
    ['noWater', { flags: 5 }],
    ['noSewage', { flags: 3 }],
    ['noRoad', { roadDisconnectedDay: 0 }],
    ['noWorkers', { defId: 'I', jobs: 20, workers: 4 }],
  ] as const)('%s abandons at its own full-day deadline', (problem, patch) => {
    const { b, advance } = fixture(patch);
    const days = PROBLEMS[problem].days;
    advance(0);
    advance(days - 0.1);
    expect(b.state).toBe('active');
    advance(days);
    expect(b.state).toBe('abandoned');
    expect(b.problemTimers[problem]).toBe(days);
    expect(b.abandonedAtTick).toBe(days * TIME.ticksPerDay);
  });
  it('repair resets immediately, repeated refreshes and same-day outages do not accumulate', () => {
    const { b, advance } = fixture({ flags: 6 });
    advance(0.4);
    advance(19.4);
    expect(b.problemTimers.noPower).toBe(19);
    b.flags = 7;
    advance(19.4);
    expect(b.problemTimers.noPower).toBe(0);
    expect(b.problemSinceTick?.noPower).toBeUndefined();
    b.flags = 6;
    advance(19.4);
    advance(19.4);
    expect(b.problemTimers.noPower).toBe(0);
    advance(39.3);
    expect(b.state).toBe('active');
    advance(39.4);
    expect(b.state).toBe('abandoned');
  });
  it('repairs one problem without cancelling another; observes no-demand water and exact worker threshold', () => {
    const { b, advance } = fixture({ flags: 0 });
    advance(0);
    advance(10);
    b.flags = 1;
    advance(10);
    expect(b.problemTimers.noPower).toBe(0);
    expect(b.problemTimers.noWater).toBe(10);
    advance(20);
    expect(b.state).toBe('abandoned');
    const empty = fixture({ households: 0, residents: 0, flags: 1 }).b;
    expect(buildingProblemIcons(empty)).toEqual([]);
    const job = fixture({ defId: 'I', jobs: 20, workers: 5 }).b;
    expect(hasBuildingProblem(job, 'noWorkers')).toBe(false);
    job.workers = 4;
    expect(hasBuildingProblem(job, 'noWorkers')).toBe(true);
  });
  it('construction and player facilities do not abandon; inactive states keep their terminal icon', () => {
    for (const patch of [
      { state: 'construction' as const },
      { kind: 'utility' as const, defId: 'water_tower' },
    ]) {
      const { b, advance } = fixture({ ...patch, flags: 0 });
      advance(0);
      advance(100);
      expect(b.state).toBe(patch.state ?? 'active');
      expect(buildingProblemIcons(b)).toEqual([]);
    }
    expect(buildingProblemIcons(fixture({ state: 'burned' }).b)).toEqual([
      'abandoned',
    ]);
  });
  it('abandonment displaces households, clears jobs and mirrors metadata; repair does not resurrect it', () => {
    const { s, b, advance } = fixture({ flags: 6 });
    const mirror = new WorldMirror();
    mirror.apply({ t: 'ready', reqId: 1, snapshot: structuredClone(s) });
    advance(0);
    const updated = advance(20);
    const population = updatePopulation(s);
    mirror.apply({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: structuredClone(updated),
    });
    mirror.apply({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: structuredClone(population),
    });
    expect(b.residents).toBe(0);
    expect(b.housing?.occupied).toBe(0);
    expect(s.stats.population).toBe(0);
    expect(s.stats.populationDetails?.movedOut).toBe(4);
    expect(mirror.readBuildings()[0]).toMatchObject({
      state: 'abandoned',
      residents: 0,
      abandonedAtTick: 200,
    });
    b.flags = 7;
    advance(21);
    expect(b.state).toBe('abandoned');
    expect(b.stateTimer).toBe(1);
  });
  it('collapses after 60 days without charges, frees all occupied cells and leaves zoning', () => {
    const { s, b, advance } = fixture({ flags: 6 });
    advance(0);
    advance(20);
    s.stats.demand = { R: 0, C: 0, I: 0, O: 0 };
    s.zoneBlocks = [
      {
        id: 2,
        segment: 3,
        side: 1,
        origin: { x: 0, z: 0 },
        dir: { x: 1, z: 0 },
        width: 1,
        cells: new Uint8Array([1, 1, 1, 1]),
        buildingAt: new Int32Array([100, 100, -1, -1]),
      },
    ];
    // No roads means the lot finder cannot regrow during this isolated cleanup assertion.
    const growth = new GrowthSystem(),
      money = s.money;
    advance(79.9);
    expect(growth.tick(s).removed).toEqual([]);
    advance(80);
    const result = growth.tick(s);
    expect(result.removed).toEqual([b.id]);
    expect(result.blocks).toHaveLength(1);
    expect(s.zoneBlocks[0]!.buildingAt).toEqual(new Int32Array(4).fill(-1));
    expect(s.zoneBlocks[0]!.cells[0]).toBe(1);
    expect(s.money).toBe(money);
  });
});

it('daily Worker settlement merges state, flags, population and timers into the mirror', () => {
  const mirror = new WorldMirror();
  const sim = new Simulation(settings, (e) => mirror.apply(e));
  const b = fixture({ flags: 0 }).b;
  const off = sim.onDay((s) => {
    s.buildings = [b];
    s.stats.population = b.residents;
  });
  sim.setSpeed(1);
  for (let i = 0; i < TIME.ticksPerDay; i++) sim.tick();
  off();
  mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
  for (let i = 0; i < 21 * TIME.ticksPerDay; i++) sim.tick();
  const world = sim.snapshot(),
    copy = mirror.readBuildings()[0]!;
  expect(world.buildings[0]!.state).toBe('abandoned');
  expect(copy.state).toBe('abandoned');
  expect(copy.residents).toBe(0);
  expect(copy.flags).toBe(0);
  expect(copy.problemTimers.noPower).toBe(20);
  expect(copy.abandonedAtTick).toBe(220);
  expect(world.stats.population).toBe(0);
  expect(world.stats.populationDetails!.movedOut).toBeGreaterThan(0);
});
