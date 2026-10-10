import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { FireSystem, fireRoll } from '../../src/sim/systems/fire';
import { CargoSystem } from '../../src/sim/systems/cargo';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { deserialize, serialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import type { SimState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { Group, PerspectiveCamera } from 'three';
import { FireRenderer } from '../../src/render/fire';
function fixture(restored?: SimState) {
  const s =
      restored ??
      createState({
        seed: 42,
        mapId: 'valley',
        mode: 'sandbox',
        cityName: 'Fire',
      }),
    roads = new RoadGraph();
  if (!restored) {
    roads.addRoad({
      start: { x: -300, z: 0 },
      end: { x: 300, z: 0 },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
    Object.assign(s, roads.snapshot());
    s.nextId = 10010;
    s.terrain.heights.fill(60);
    s.buildings = [0, 1].map((i) => ({
      ...structuredClone(districtFixture(1)[0]!),
      id: 10001 + i,
      kind: i ? ('zoned' as const) : ('service' as const),
      defId: i ? 'RL' : 'fire_station',
      state: 'active' as const,
      pos: { x: i ? 40 : -40, z: 9 },
      rotation: 0,
      lotW: i ? 2 : 4,
      lotD: i ? 2 : 4,
      flags: 7,
      level: 1,
      households: 0,
      residents: 0,
      jobs: 0,
      workers: 0,
    }));
    s.buildings[1]!.fire = { burning: true, damage: 0, startedDay: 0 };
  }
  const lanes = new LaneGraph();
  lanes.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, lanes, schedules),
    traffic = new TrafficSystem(
      s,
      lanes,
      planner,
      schedules,
      restored?.traffic,
    ),
    fire = new FireSystem(s, planner, traffic),
    cargo = new CargoSystem(s, lanes, planner, traffic);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      s.clock.ticks++;
      s.clock.day = Math.floor(s.clock.ticks / 10);
      s.clock.tickInDay = s.clock.ticks % 10;
      if (!s.clock.tickInDay) fire.daily();
      traffic.step(0.24);
      cargo.tick();
      fire.tick();
    }
  };
  return {
    s,
    lanes,
    planner,
    traffic,
    fire,
    cargo,
    step,
    home: s.buildings[1]!,
    station: s.buildings[0]!,
  };
}
describe('fire response', () => {
  it('dispatches a real fire vehicle, preserves the fire before arrival, and extinguishes only on arrival', () => {
    const f = fixture();
    f.fire.tick();
    expect(f.s.fire.missions).toHaveLength(1);
    const v = f.traffic.snapshot().vehicles[0]!;
    expect(v.kind).toBe(4);
    expect(v.journey.purpose).toBe(7);
    expect(f.home.fire!.burning).toBe(true);
    f.step();
    expect(f.home.fire!.burning).toBe(true);
    for (let i = 0; i < 18 && f.home.fire!.burning; i++) f.step();
    expect(f.home.fire!.burning).toBe(false);
    expect(f.home.state).toBe('active');
    expect(f.s.fire.missions).toHaveLength(0);
    expect(f.traffic.snapshot().vehicles).toHaveLength(0);
  });
  it('loses 50% each day and burns after two days without a station; a repeated daily call is inert', () => {
    const f = fixture();
    f.station.enabled = false;
    f.step(10);
    expect(f.home.fire!.damage).toBe(0.5);
    f.fire.daily();
    expect(f.home.fire!.damage).toBe(0.5);
    f.step(10);
    expect(f.home.state).toBe('burned');
    expect(f.home.fire).toEqual({ burning: false, damage: 1, startedDay: 0 });
    expect(f.s.fire.missions).toHaveLength(0);
  });
  it('never extinguishes a fire when a road is cut under its vehicle', () => {
    const f = fixture();
    f.fire.tick();
    f.step(2);
    f.s.segments = [];
    f.s.nodes = [];
    f.lanes.sync([], []);
    f.traffic.networkChanged();
    f.fire.networkChanged();
    f.step(18);
    expect(f.home.state).toBe('burned');
    expect(f.traffic.snapshot().arrived).toBe(0);
    expect(f.s.fire.missions).toHaveLength(0);
  });
  it('respects budget-adjusted vehicle capacity and releases reservations when a station is disabled', () => {
    const f = fixture();
    f.s.budgets.fire = 0.5;
    f.s.buildings.push(
      ...[2, 3, 4].map((i) => ({
        ...structuredClone(f.home),
        id: 10001 + i,
        pos: { x: 40 + i * 35, z: 9 },
      })),
    );
    f.fire.tick();
    expect(f.s.fire.missions).toHaveLength(2);
    f.station.enabled = false;
    f.fire.reconcile();
    expect(f.s.fire.missions).toHaveLength(0);
    expect(f.traffic.snapshot().vehicles).toHaveLength(0);
  });
  it('uses deterministic daily ignition and suppresses it with full fire coverage', () => {
    const f = fixture();
    delete f.home.fire;
    f.station.enabled = false;
    let seed = 0;
    while (fireRoll(seed, f.home.id, 1) >= 0.0002) seed++;
    f.s.seed = seed;
    f.s.clock.day = 1;
    f.fire.daily();
    expect(f.s.buildings[1]!.fire?.burning).toBe(true);
    const covered = fixture();
    delete covered.home.fire;
    covered.s.seed = seed;
    covered.home.coverage = { fire: 1 };
    covered.s.clock.day = 1;
    covered.fire.daily();
    expect(covered.home.fire).toBeUndefined();
  });
  it('retains physical position and damage through save/load; rejects conflicting mission IDs and invalid damage', async () => {
    const f = fixture();
    f.fire.tick();
    f.step(2);
    f.s.traffic = f.traffic.snapshot();
    const saved = await deserialize(await serialize(f.s));
    const resumed = fixture(
      Object.assign(createState(saved.settings), saved, {
        terrain: f.s.terrain,
      }),
    );
    expect(resumed.traffic.snapshot().vehicles[0]!.x).toBe(
      f.s.traffic.vehicles[0]!.x,
    );
    resumed.step(17);
    expect(resumed.home.fire!.burning).toBe(false);
    expect(resumed.home.state).toBe('active');
    const bad = structuredClone(saved);
    bad.buildings[1]!.fire!.damage = 2;
    expect(() => migrateSave(bad, 1)).toThrow();
    const duplicate = structuredClone(saved);
    duplicate.fire.missions.push({ ...duplicate.fire.missions[0]! });
    expect(() => migrateSave(duplicate, 1)).toThrow();
    const old = structuredClone(saved);
    old.fire.missions = [];
    old.traffic.vehicles = [];
    old.traffic.routes = [];
    delete (old as Partial<typeof old>).fire;
    expect(migrateSave(old, 1).fire.missions).toEqual([]);
  });
  it('keeps cargo and fire arrivals in independent mission queues', () => {
    const f = fixture();
    f.home.defId = 'CL';
    f.home.jobs = 12;
    f.s.buildings.push({
      ...structuredClone(f.home),
      id: 10003,
      defId: 'I',
      pos: { x: -160, z: 9 },
      fire: undefined,
      jobs: 24,
      workers: 24,
    });
    f.cargo.reconcile();
    f.home.cargo!.stock = 0;
    f.s.buildings[2]!.cargo!.stock = 120;
    f.cargo.tick();
    f.fire.tick();
    expect(f.s.cargo.shipments.length).toBeGreaterThan(0);
    expect(f.s.fire.missions.length).toBeGreaterThan(0);
    f.step(18);
    expect(f.home.fire!.burning).toBe(false);
    expect(f.home.state).toBe('active');
    f.step(100);
    expect(f.s.cargo.delivered).toBeGreaterThan(0);
  });
  it('integrates burn-out into the authoritative simulation and stops population/coverage', () => {
    const f = fixture();
    f.station.enabled = false;
    f.s.clock.speed = 1;
    const sim = new Simulation(f.s.settings, () => {}, f.s);
    for (let i = 0; i < 20; i++) sim.advance(240);
    const b = sim.snapshot().buildings.find((b) => b.id === f.home.id)!;
    expect(b.state).toBe('burned');
    expect(b.residents).toBe(0);
    expect(b.fire!.burning).toBe(false);
  });
});
it('updates the flame batch on partial patches and removes it after extinguishing', () => {
  const f = fixture(),
    r = new FireRenderer(new Group(), () => 60),
    camera = new PerspectiveCamera();
  camera.position.set(0, 100, 200);
  r.reset(f.s.buildings);
  r.update(0.1, camera);
  expect(r.geometry.instanceCount).toBe(1);
  r.accept({
    t: 'buildingsChanged',
    added: [],
    removed: [],
    updated: [
      { id: f.home.id, fire: { burning: false, damage: 0.5, startedDay: 0 } },
    ],
  });
  r.update(0.1, camera);
  expect(r.geometry.instanceCount).toBe(0);
  r.dispose();
  r.dispose();
});
it('chooses the nearest connected available station', () => {
  const f = fixture();
  f.s.buildings.push({
    ...structuredClone(f.station),
    id: 10003,
    pos: { x: 20, z: 9 },
  });
  f.fire.tick();
  expect(f.s.fire.missions[0]!.from).toBe(10003);
});
it('resumes a stranded fire vehicle from the same physical location after the road is restored', () => {
  const f = fixture();
  f.fire.tick();
  f.step(2);
  const nodes = f.s.nodes,
    segments = f.s.segments,
    before = f.traffic.snapshot().vehicles[0]!;
  f.s.nodes = [];
  f.s.segments = [];
  f.lanes.sync([], []);
  f.traffic.networkChanged();
  f.fire.networkChanged();
  f.step();
  const stuck = f.traffic.strandedMission(f.s.fire.missions[0]!.id)!;
  expect(stuck.x).toBeCloseTo(before.x);
  expect(f.home.fire!.burning).toBe(true);
  f.s.nodes = nodes;
  f.s.segments = segments;
  f.lanes.sync(nodes, segments);
  f.traffic.networkChanged();
  f.fire.networkChanged();
  f.step(16);
  expect(f.home.state).toBe('active');
  expect(f.home.fire!.burning).toBe(false);
});
