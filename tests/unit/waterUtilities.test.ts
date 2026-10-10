import { describe, it, expect } from 'vitest';
import { WATER_UTILITY as W } from '../../src/data/waterUtility';
import { WORLD, MAP_SIZE, SEA_LEVEL } from '../../src/data/config';
import { updateWater } from '../../src/sim/systems/water';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import { WorldMirror } from '../../src/bridge/mirror';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import {
  previewWaterFacility,
  previewPipe,
  previewRoadPipes,
  snapPipe,
  type WaterWorld,
} from '../../src/world/waterUtility';
import { RoadGraph } from '../../src/world/roadGraph';
import type { Building } from '../../src/world/types';
import type { SimEvent } from '../../src/bridge/protocol';
const settings = {
  seed: 72,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Water',
};
function building(id: number, x: number, defId = 'RL', z = 0): Building {
  return {
    ...districtFixture(1)[0]!,
    id,
    defId,
    kind: defId.startsWith('water_') ? 'utility' : 'zoned',
    state: 'active',
    pos: { x, z },
    rotation: 0,
    lotW: 2,
    lotD: 2,
    households: 10,
    jobs: 0,
    residents: 0,
    workers: 0,
    flags: 9,
  };
}
const pipe = (id: number, x1: number, x2: number, z = 0) => ({
  id,
  points: [
    { x: x1, z },
    { x: x2, z },
  ],
});
function state(...buildings: Building[]) {
  const s = createState(settings);
  s.terrain.heights.fill(60);
  s.buildings = buildings;
  return s;
}
function world(): WaterWorld {
  const s = state();
  return {
    ...s,
    heights: s.terrain.heights,
    mode: s.settings.mode,
    networks: [],
  };
}
const wet = (b: Building) => !!(b.flags & W.waterFlag),
  drained = (b: Building) => !!(b.flags & W.sewageFlag);
function road(w: WaterWorld, x1: number, x2: number, z = 0) {
  const graph = new RoadGraph();
  graph.addRoad({
    type: 'road_small',
    start: { x: x1, z },
    end: { x: x2, z },
    builtDay: 0,
  });
  return { ...w, ...graph.snapshot() };
}
describe('water and sewage network', () => {
  it('serves the 48m footprint boundary, not a building just beyond it', () => {
    const s = state(
      building(1, 0, 'water_tower'),
      building(2, 80, 'RL', 48),
      building(3, 120, 'RL', 48.01),
    );
    s.networks.water = [pipe(10, -10, 150)];
    updateWater(s);
    expect(s.buildings.map(wet)).toEqual([true, true, false]);
    expect(s.stats.water).toMatchObject({
      produced: 6000,
      consumed: 240,
      served: 120,
      unserved: 1,
    });
    expect(s.buildings[1]!.flags & 9).toBe(9);
  });
  it('requires actual pipes even when a home is beside a water tower', () => {
    const s = state(building(1, 0, 'water_tower'), building(2, 20));
    updateWater(s);
    expect(wet(s.buildings[1]!)).toBe(false);
    expect(s.stats.water.served).toBe(0);
  });
  it('does not connect merely overlapping 48m coverage areas or relay through homes', () => {
    const s = state(building(1, -80, 'water_tower'), building(2, 100));
    s.networks.water = [pipe(10, -100, -20), pipe(11, 20, 120)];
    updateWater(s);
    expect(wet(s.buildings[1]!)).toBe(false);
    expect(s.stats.water.groups).toBe(2);
  });
  it('joins crossing pipes and disconnects a remote district when the connector is removed', () => {
    const s = state(building(1, -200, 'water_tower'), building(2, 100));
    s.networks.water = [
      pipe(10, -220, -150),
      pipe(11, 50, 120),
      pipe(12, -160, 60),
    ];
    updateWater(s);
    expect(wet(s.buildings[1]!)).toBe(true);
    s.networks.water.pop();
    updateWater(s);
    expect(wet(s.buildings[1]!)).toBe(false);
  });
  it('adds power-dependent capacity and loses it immediately on power failure', () => {
    const s = state(
      building(1, 0, 'water_tower'),
      building(2, 20, 'water_tower'),
      building(3, 80),
    );
    s.networks.water = [pipe(10, -10, 100)];
    updateWater(s);
    expect(s.stats.water.produced).toBe(12000);
    for (const b of s.buildings) b.flags &= ~1;
    updateWater(s);
    expect(s.stats.water.produced).toBe(0);
    expect(s.stats.water.served).toBe(0);
    expect(wet(s.buildings[2]!)).toBe(false);
  });
  it('prioritizes nearby buildings when capacity cannot supply every load', () => {
    const s = state(
      building(1, 0, 'water_tower'),
      building(2, 40),
      building(3, 80),
    );
    s.buildings[1]!.households = 400;
    s.buildings[2]!.households = 200;
    s.networks.water = [pipe(10, -10, 100)];
    updateWater(s);
    expect(s.buildings.map(wet)).toEqual([true, true, false]);
    expect(s.stats.water.served).toBe(4800);
  });
  it('independently serves sewage and clears the flag after removing the outlet', () => {
    const s = state(
      building(1, 0, 'water_tower'),
      building(2, 40, 'water_drain'),
      building(3, 80),
    );
    s.networks.water = [pipe(10, -10, 100)];
    updateWater(s);
    expect(s.stats.sewage).toMatchObject({
      capacity: 30000,
      produced: 120,
      treated: 120,
      uncollected: 0,
    });
    expect(drained(s.buildings[2]!)).toBe(true);
    s.buildings = s.buildings.filter((b) => b.id !== 2);
    updateWater(s);
    expect(wet(s.buildings[1]!)).toBe(true);
    expect(drained(s.buildings[1]!)).toBe(false);
    expect(s.stats.sewage.treated).toBe(0);
  });
  it('cannot borrow sewage capacity from another island and respects outlet capacity', () => {
    const s = state(building(1, -200, 'water_drain'), building(2, 100));
    s.buildings[1]!.households = 3000;
    s.networks.water = [pipe(10, -220, -180), pipe(11, 80, 120)];
    updateWater(s);
    expect(s.stats.sewage.treated).toBe(0);
    s.networks.water.push(pipe(12, -190, 90));
    updateWater(s);
    expect(s.stats.sewage.treated).toBe(0);
    expect(s.stats.sewage.uncollected).toBe(1);
  });
  it('uses occupied homes and all zone jobs; inactive buildings get neither service', () => {
    const home = building(2, 40);
    home.households = 100;
    home.housing = {
      sizes: [2, 0, 0, 0, 0],
      occupied: 2,
      education: [2, 0, 0, 0],
      ages: [0, 2, 0, 0],
      averageEducation: 0,
      availableWorkers: [2, 0, 0, 0],
      employed: 0,
      assignments: [],
    };
    const job = building(3, 80, 'I');
    job.jobs = 20;
    const inactive = building(4, 120);
    inactive.state = 'construction';
    inactive.flags = 15;
    const s = state(building(1, 0, 'water_tower'), home, job, inactive);
    s.networks.water = [pipe(10, -10, 140)];
    updateWater(s);
    expect(s.stats.water.consumed).toBe(224);
    expect(wet(inactive)).toBe(false);
    expect(drained(inactive)).toBe(false);
  });
  it('is deterministic across network input order and preserves unrelated flags', () => {
    const s = state(building(1, 0, 'water_tower'), building(2, 80));
    s.networks.water = [pipe(11, 40, 100), pipe(10, -10, 45)];
    updateWater(s);
    const stats = { ...s.stats.water },
      flags = s.buildings.map((b) => b.flags);
    s.networks.water.reverse();
    updateWater(s);
    expect(s.stats.water).toEqual(stats);
    expect(s.buildings.map((b) => b.flags)).toEqual(flags);
  });
});
describe('water construction validation and auto pipes', () => {
  it('requires a submerged intake while preserving a dry footprint and supports rotation', () => {
    const w = world();
    for (let z = 0; z < WORLD.heightmapVertices; z++)
      for (let x = 0; x < WORLD.heightmapVertices; x++)
        if (x * 16 - MAP_SIZE / 2 >= 32)
          w.heights[z * WORLD.heightmapVertices + x] = SEA_LEVEL - 4;
    expect(
      previewWaterFacility(w, 'water_pump', { x: 0, z: 0 }, 0).reason,
    ).toBe('err.waterShore');
    expect(
      previewWaterFacility(w, 'water_pump', { x: 0, z: 0 }, -Math.PI / 2),
    ).toMatchObject({
      valid: true,
      cost: 2500,
      output: 12000,
      intake: { x: 32 },
    });
    expect(
      previewWaterFacility(w, 'water_drain', { x: 0, z: 0 }, -Math.PI / 2)
        .valid,
    ).toBe(true);
    expect(
      previewWaterFacility(w, 'water_pump', { x: 64, z: 0 }, 0).valid,
    ).toBe(false);
  });
  it('rejects illegal coordinates, locked facilities, steep land and insufficient funds', () => {
    const w = world();
    expect(
      previewWaterFacility(w, 'water_tower', { x: NaN, z: 0 }, 0).valid,
    ).toBe(false);
    expect(
      previewWaterFacility(w, 'water_treatment', { x: 0, z: 0 }, 0).reason,
    ).toBe('err.waterLocked');
    expect(
      previewWaterFacility(
        { ...w, money: 2999 },
        'water_tower',
        { x: 0, z: 0 },
        0,
      ).reason,
    ).toBe('err.notEnoughMoney');
    w.heights.fill(30);
    expect(
      previewWaterFacility(w, 'water_tower', { x: 0, z: 0 }, 0).reason,
    ).toBe('err.waterTerrain');
  });
  it('rejects overlapping facilities and roads, allows unlocked treatment and sandbox', () => {
    let w = world();
    w.buildings = [building(1, 0, 'water_tower')];
    expect(
      previewWaterFacility(w, 'water_tower', { x: 0, z: 0 }, 0).reason,
    ).toBe('err.buildingConflict');
    w = road(world(), -80, 80);
    expect(
      previewWaterFacility(w, 'water_tower', { x: 0, z: 0 }, 0).reason,
    ).toBe('err.roadOverlap');
    expect(
      previewWaterFacility(
        { ...world(), mode: 'sandbox' },
        'water_treatment',
        { x: 0, z: 0 },
        0,
      ),
    ).toMatchObject({ valid: true, cost: 0, output: 30000 });
  });
  it('allows pipes beneath water, enforces ownership and charges length', () => {
    const w = world();
    w.heights.fill(20);
    expect(
      previewPipe(w, [
        { x: 0, z: 0 },
        { x: 80, z: 0 },
      ]),
    ).toMatchObject({ valid: true, cost: 100 });
    expect(
      previewPipe(w, [
        { x: 0, z: 0 },
        { x: 7, z: 0 },
      ]).reason,
    ).toBe('err.waterLength');
    expect(
      previewPipe(w, [
        { x: 0, z: 0 },
        { x: 500, z: 0 },
      ]).reason,
    ).toBe('err.landNotOwned');
    expect(
      previewPipe(w, [
        { x: NaN, z: 0 },
        { x: 10, z: 0 },
      ]).valid,
    ).toBe(false);
  });
  it('snaps an endpoint to a pipe without silently snapping across a large gap', () => {
    const w = world();
    w.networks = [pipe(10, 0, 100)];
    expect(snapPipe(w, { x: 50, z: 6 })).toEqual({ x: 50, z: 0 });
    expect(snapPipe(w, { x: 50, z: 10 })).toEqual({ x: 50, z: 10 });
  });
  it('previews all road lengths, refuses insufficient total funds and is repeat-safe', () => {
    const w = road(world(), -80, 80);
    const p = previewRoadPipes(w);
    expect(p).toMatchObject({ valid: true, cost: 200 });
    expect(previewRoadPipes({ ...w, money: 199 }).reason).toBe(
      'err.notEnoughMoney',
    );
    w.networks = p.paths!.map((points, i) => ({ id: i + 100, points }));
    expect(previewRoadPipes(w)).toMatchObject({
      valid: false,
      cost: 0,
      reason: 'err.waterNothing',
    });
  });
  it('only adds an uncovered road portion and does not mistake a crossing for coverage', () => {
    const w = road(world(), -80, 80);
    w.networks = [pipe(10, -80, 0)];
    expect(previewRoadPipes(w).cost).toBe(100);
    w.networks = [
      {
        id: 10,
        points: [
          { x: 0, z: -40 },
          { x: 0, z: 40 },
        ],
      },
    ];
    expect(previewRoadPipes(w).cost).toBe(200);
  });
  it('commits all automatic pipes once, mirrors unique IDs and refunds exact paid amounts', () => {
    const mirror = new WorldMirror(),
      events: SimEvent[] = [],
      sim = new Simulation(settings, (e) => {
        events.push(e);
        mirror.apply(e);
      });
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    expect(
      sim.buildRoad('road_small', {
        start: { x: -240, z: -80 },
        c1: { x: -200, z: -80 },
        c2: { x: -160, z: -80 },
        end: { x: -120, z: -80 },
        elevated: false,
      }).ok,
    ).toBe(true);
    const before = sim.snapshot();
    const p = sim.buildWaterPipes();
    expect(p.ok).toBe(true);
    const after = sim.snapshot();
    expect(after.money).toBe(before.money - p.cost!);
    expect(mirror.readPowerWorld('water')?.networks).toEqual(
      after.networks.water,
    );
    expect(sim.buildWaterPipes()).toMatchObject({
      ok: false,
      reason: 'err.waterNothing',
    });
    expect(sim.snapshot().money).toBe(after.money);
    const targets = after.networks.water.map((n) => ({
      kind: 'network' as const,
      id: n.id,
    }));
    expect(sim.bulldoze(targets).refund).toBe(p.cost);
    expect(sim.snapshot().money).toBe(before.money);
    expect(mirror.readSnapshot()?.nextId).toBe(sim.snapshot().nextId);
    expect(
      events.some((e) => e.t === 'networksChanged' && e.net === 'water'),
    ).toBe(true);
  });
  it('validates worker water commands and rejects unknown network types', () => {
    const events: SimEvent[] = [],
      d = new CommandDispatcher((e) => events.push(e));
    d.handle({ t: 'init', reqId: 1, ...settings });
    d.handle({
      t: 'buildNetwork',
      reqId: 2,
      net: 'water',
      points: [
        { x: -200, z: -200 },
        { x: -120, z: -200 },
      ],
    });
    expect(events.at(-1)).toMatchObject({ t: 'result', ok: true, cost: 100 });
    d.handle({ t: 'buildNetwork', reqId: 3, net: 'water', points: [null] });
    expect(events.at(-1)).toMatchObject({
      ok: false,
      reason: 'err.invalidCommand',
    });
    d.handle({ t: 'buildRoadPipes', reqId: 4 });
    expect(events.at(-1)).toMatchObject({
      ok: false,
      reason: 'err.waterNothing',
    });
  });
});

it('finds usable river-bank sites on the default generated map', () => {
  const s = createState({ ...settings, seed: 20261006 });
  const w = {
    ...s,
    heights: s.terrain.heights,
    mode: s.settings.mode,
    networks: [],
  };
  const sites = [];
  for (let x = 150; x < 450; x += 2) {
    const pos = { x, z: 0 };
    if (previewWaterFacility(w, 'water_drain', pos, Math.PI * 1.5).valid)
      sites.push({ x, y: s.terrain.heightAt(x, 0) });
  }
  expect(sites.length).toBeGreaterThan(0);
});

it('operates a powered pump and treatment plant on a shared pipe and stops abandoned sources', () => {
  const s = state(
    building(1, 0, 'water_pump'),
    building(2, 40, 'water_treatment'),
    building(3, 80),
  );
  s.networks.water = [pipe(10, -10, 100)];
  updateWater(s);
  expect(s.stats.water).toMatchObject({ produced: 12000, served: 120 });
  expect(s.stats.sewage).toMatchObject({ capacity: 30000, treated: 120 });
  s.buildings[0]!.state = 'abandoned';
  s.buildings[1]!.state = 'burned';
  updateWater(s);
  expect(s.stats.water.produced).toBe(0);
  expect(s.stats.sewage.capacity).toBe(0);
});
it('rechecks auto-road funds in the worker and leaves money, IDs and networks unchanged on rejection', () => {
  const sim = new Simulation(settings);
  sim.buildRoad('road_small', {
    start: { x: -240, z: -80 },
    c1: { x: -200, z: -80 },
    c2: { x: -160, z: -80 },
    end: { x: -120, z: -80 },
    elevated: false,
  });
  sim.onDay((s) => {
    s.money = 50;
    s.stats.money = 50;
  });
  sim.setSpeed(1);
  for (let i = 0; i < 10; i++) sim.tick();
  const before = sim.snapshot();
  expect(sim.buildWaterPipes()).toMatchObject({
    ok: false,
    reason: 'err.notEnoughMoney',
  });
  expect(sim.place('water_pump', { x: -200, z: -200 }, 0)).toMatchObject({
    ok: false,
  });
  const after = sim.snapshot();
  expect(after.money).toBe(before.money);
  expect(after.nextId).toBe(before.nextId);
  expect(after.networks).toEqual(before.networks);
  expect(after.buildings).toEqual(before.buildings);
});
