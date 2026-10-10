import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import { CommandDispatcher } from '../../src/sim/commands';
import type { SimEvent } from '../../src/bridge/protocol';
import { RoadGraph } from '../../src/world/roadGraph';
import { LaneGraph } from '../../src/world/laneGraph';
import { createState } from '../../src/sim/state';
import { createCitizens, CitizenState } from '../../src/world/citizens';
import {
  JourneyStatus,
  JourneyPurpose,
  TravelMode,
  type Journey,
} from '../../src/world/schedules';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { TRAFFIC_RUNTIME } from '../../src/data/traffic';
import { TRAFFIC } from '../../src/data/simulation';
import type { Route } from '../../src/world/routes';
import { greenGroup, signalGroups } from '../../src/world/intersections';

function fixture(count = 2, length = 1500, cross = false) {
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'normal',
    cityName: 'Traffic',
  });
  const roads = new RoadGraph();
  const add = (ax: number, az: number, bx: number, bz: number) =>
    roads.addRoad({
      start: { x: ax, z: az },
      end: { x: bx, z: bz },
      type: 'road_small',
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
  add(0, 0, length, 0);
  if (cross) add(length / 2, -500, length / 2, 500);
  Object.assign(s, roads.snapshot());
  s.buildings = [
    {
      ...structuredClone(districtFixture(1)[0]!),
      id: 10001,
      defId: 'RH',
      kind: 'zoned',
      state: 'active',
      pos: { x: 100, z: 8 },
    },
    {
      ...structuredClone(districtFixture(1)[0]!),
      id: 10002,
      defId: 'I',
      kind: 'zoned',
      state: 'active',
      pos: { x: length - 100, z: 8 },
    },
  ];
  const c = (s.citizens = createCitizens(count));
  c.count = count;
  c.nextId = count + 1;
  c.nextHouseholdId = count + 1;
  for (let i = 0; i < count; i++) {
    c.id[i] = i + 1;
    c.homeId[i] = 10001;
    c.workId[i] = 10002;
    c.householdId[i] = i + 1;
    c.age[i] = 32;
    c.health[i] = 80;
    c.happiness[i] = 80;
    c.locationId[i] = 10001;
  }
  const lanes = new LaneGraph();
  lanes.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, lanes, schedules);
  planner.paths.sync(s.nodes, s.segments);
  const traffic = new TrafficSystem(s, lanes, planner, schedules);
  const request = (i = 0, mode = TravelMode.drive as number): Journey => {
    c.tripStatus[i] = JourneyStatus.pending;
    c.tripPurpose[i] = JourneyPurpose.work;
    c.travelMode[i] = mode;
    c.tripOriginId[i] = 10001;
    c.destinationId[i] = 10002;
    c.tripStartTick[i] = s.clock.ticks;
    c.state[i] = CitizenState.commuting;
    return {
      citizenId: i + 1,
      originId: 10001,
      destinationId: 10002,
      purpose: JourneyPurpose.work,
      mode,
      requestedTick: s.clock.ticks,
    };
  };
  const route = planner.paths.find(
    s.buildings[0]!.pos,
    s.buildings[1]!.pos,
    'drive',
  )!;
  const step = (n = 1, seconds = 0.24) => {
    for (let i = 0; i < n; i++) {
      s.clock.ticks++;
      traffic.step(seconds);
    }
  };
  return {
    s,
    c,
    roads,
    lanes,
    schedules,
    planner,
    traffic,
    request,
    route,
    step,
  };
}
describe('physical personal traffic', () => {
  it('moves continuously along its route and acknowledges actual workplace arrival', () => {
    const f = fixture(),
      j = f.request();
    expect(f.traffic.spawn({ journey: j, route: f.route })).toBe(true);
    let previous = f.traffic.inspect(1)!;
    for (let i = 0; i < 300 && f.traffic.count; i++) {
      f.step();
      const now = f.traffic.inspect(1);
      if (now) {
        expect(Math.hypot(now.x - previous.x, now.z - previous.z)).toBeLessThan(
          20,
        );
        previous = now;
        expect(f.c.locationId[0]).toBe(10001);
      }
    }
    expect(f.traffic.count).toBe(0);
    expect(f.c.locationId[0]).toBe(10002);
    expect(f.c.state[0]).toBe(CitizenState.working);
    expect(f.traffic.snapshot().arrived).toBe(1);
  });
  it('queues at a shared driveway and maintains vehicle length plus safety gap', () => {
    const f = fixture(),
      j = f.request(),
      j2 = f.request(1);
    expect(f.traffic.spawn({ journey: j, route: f.route })).toBe(true);
    expect(f.traffic.spawn({ journey: j2, route: f.route })).toBe(false);
    f.step(15);
    expect(f.traffic.spawn({ journey: j2, route: f.route })).toBe(true);
    for (let i = 0; i < 70; i++) {
      f.step();
      const a = f.traffic.inspect(1),
        b = f.traffic.inspect(2);
      if (a && b)
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
          TRAFFIC_RUNTIME.carLengthM + TRAFFIC.safetyGapM - 1e-4,
        );
    }
  });
  it('pauses without changing positions and restores precise progress and citizen identity', () => {
    const f = fixture();
    f.traffic.spawn({ journey: f.request(), route: f.route });
    f.step(12);
    const saved = f.traffic.snapshot();
    const before = f.traffic.frame();
    f.traffic.step(0);
    expect(f.traffic.frame()).toEqual(before);
    const restored = new TrafficSystem(
      f.s,
      f.lanes,
      f.planner,
      f.schedules,
      structuredClone(saved),
    );
    expect(restored.frame()).toEqual(before);
    expect(
      [...f.traffic.roadVehicleCounts().values()].reduce(
        (sum, v) => sum + v.count,
        0,
      ),
    ).toBe(1);
    expect(restored.roadVehicleCounts()).toEqual(f.traffic.roadVehicleCounts());
    f.traffic.step(0.24);
    restored.step(0.24);
    expect(restored.frame()).toEqual(f.traffic.frame());
    expect(restored.inspect(1)).toMatchObject({
      citizenId: 1,
      homeId: 10001,
      workId: 10002,
      destinationId: 10002,
    });
  });
  it('does not interrupt agents for an unrelated road addition; removed roads preserve physical retry origins', () => {
    const f = fixture();
    f.traffic.spawn({ journey: f.request(), route: f.route });
    f.step(12);
    f.roads.addRoad({
      start: { x: 0, z: 200 },
      end: { x: 100, z: 200 },
      type: 'road_small',
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
    Object.assign(f.s, f.roads.snapshot());
    f.lanes.sync(f.s.nodes, f.s.segments);
    f.traffic.networkChanged();
    expect(f.traffic.count).toBe(1);
    const before = f.traffic.inspect(1)!;
    f.roads.removeSegment(f.s.segments[0]!.id);
    Object.assign(f.s, f.roads.snapshot());
    f.lanes.sync(f.s.nodes, f.s.segments);
    f.traffic.networkChanged();
    expect(f.traffic.count).toBe(0);
    expect(f.c.locationId[0]).toBe(10001);
    expect(f.traffic.snapshot().stranded[0]).toMatchObject({
      x: before.x,
      z: before.z,
    });
    f.s.clock.ticks += 30;
    f.planner.tick();
    expect(f.planner.takeReady()).toHaveLength(0);
    f.roads.addRoad({
      start: { x: 0, z: 0 },
      end: { x: 1500, z: 0 },
      type: 'road_small',
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
    Object.assign(f.s, f.roads.snapshot());
    f.lanes.sync(f.s.nodes, f.s.segments);
    f.traffic.networkChanged();
    f.s.clock.ticks += 30;
    f.planner.tick();
    const job = f.planner.takeReady()[0]!;
    expect(job).toBeDefined();
    expect(f.traffic.spawn(job)).toBe(true);
    const after = f.traffic.inspect(2)!;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(
      0.01,
    );
  });
  it('reroutes a removed workplace home from the current position without fabricating arrival', () => {
    const f = fixture();
    f.traffic.spawn({ journey: f.request(), route: f.route });
    f.step(12);
    const before = f.traffic.inspect(1)!;
    f.s.buildings.pop();
    f.schedules.tick();
    f.step();
    expect(f.traffic.count).toBe(0);
    expect(f.traffic.snapshot().arrived).toBe(0);
    expect(f.traffic.snapshot().stranded[0]).toMatchObject({
      x: before.x,
      journey: { destinationId: 10001, purpose: JourneyPurpose.home },
    });
    expect(f.c.tripStatus[0]).toBe(JourneyStatus.blocked);
  });
  it('moves pedestrians on their own walking routes in either direction', () => {
    const f = fixture();
    const route = f.planner.paths.find(
      f.s.buildings[0]!.pos,
      f.s.buildings[1]!.pos,
      'walk',
    )!;
    f.traffic.spawn({ journey: f.request(0, TravelMode.walk), route });
    const before = f.traffic.inspect(1)!;
    f.step(20);
    const after = f.traffic.inspect(1)!;
    expect(after.kind).toBe(8);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(
      20,
    );
    expect(after.speed).toBeLessThanOrEqual(1.4);
  });
  it('stops before a red light, then crosses on green without overlapping the intersection', () => {
    const f = fixture(2, 1500, true),
      node = f.s.nodes.find((n) => n.segments.length === 4)!;
    node.control = 'lights';
    f.lanes.sync(f.s.nodes, f.s.segments);
    f.traffic.networkChanged();
    const route = f.planner.paths.find(
      f.s.buildings[0]!.pos,
      f.s.buildings[1]!.pos,
      'drive',
    )!;
    const incoming = route.legs.find((l) => l.node)!.fromLane!,
      segment = f.lanes.lanes.get(incoming)!.segment;
    const groups = signalGroups(node, f.s.segments, f.s.nodes),
      green = greenGroup(groups, 0).includes(segment) ? 0 : 12,
      red = green === 0 ? 12 : 0;
    f.traffic.spawn({ journey: f.request(), route });
    for (let i = 0; i < 140; i++) {
      f.s.clock.ticks++;
      f.traffic.step(0.24, red);
    }
    const stopped = f.traffic.snapshot().vehicles[0]!;
    expect(stopped.speed).toBe(0);
    expect(stopped.reservedNode).toBe(0);
    const leg = route.legs[stopped.leg]!;
    expect(leg.length - stopped.distance).toBeCloseTo(7.2, 3);
    for (let i = 0; i < 200 && f.traffic.count; i++) {
      f.s.clock.ticks++;
      f.traffic.step(0.24, green);
    }
    expect(f.traffic.snapshot().arrived).toBe(1);
  });
  it('waits at stop signs and eventually releases the junction for another vehicle', () => {
    const f = fixture(2, 1500, true),
      node = f.s.nodes.find((n) => n.segments.length === 4)!;
    node.control = 'stop';
    f.lanes.sync(f.s.nodes, f.s.segments);
    f.traffic.networkChanged();
    const route = f.planner.paths.find(
      f.s.buildings[0]!.pos,
      f.s.buildings[1]!.pos,
      'drive',
    )!;
    f.traffic.spawn({ journey: f.request(), route });
    f.step(20);
    f.traffic.spawn({ journey: f.request(1), route });
    let waited = false;
    for (let i = 0; i < 300 && f.traffic.count; i++) {
      f.step();
      if (f.traffic.snapshot().vehicles.some((v) => v.stopWait >= 0.96))
        waited = true;
    }
    expect(waited).toBe(true);
    expect(f.traffic.snapshot().arrived).toBe(2);
  });
  it('removes a car stuck for 60 seconds without treating despawn as arrival', () => {
    const f = fixture(1, 1500, true),
      node = f.s.nodes.find((n) => n.segments.length === 4)!;
    node.control = 'lights';
    f.lanes.sync(f.s.nodes, f.s.segments);
    f.traffic.networkChanged();
    const route = f.planner.paths.find(
      f.s.buildings[0]!.pos,
      f.s.buildings[1]!.pos,
      'drive',
    )!;
    const segment = f.lanes.lanes.get(
        route.legs.find((l) => l.node)!.fromLane!,
      )!.segment,
      groups = signalGroups(node, f.s.segments, f.s.nodes),
      red = greenGroup(groups, 0).includes(segment) ? 12 : 0;
    f.traffic.spawn({ journey: f.request(), route });
    for (let i = 0; i < 500 && f.traffic.count; i++) {
      f.s.clock.ticks++;
      f.traffic.step(0.24, red);
    }
    const saved = f.traffic.snapshot();
    expect(saved.removedStuck).toBe(1);
    expect(saved.arrived).toBe(0);
    expect(saved.stranded).toHaveLength(1);
    expect(f.c.locationId[0]).toBe(10001);
    expect(f.c.tripStatus[0]).toBe(JourneyStatus.blocked);
  });
  it('serializes traffic geometry references and rejects corrupted progress or duplicate agents', async () => {
    const f = fixture();
    f.traffic.spawn({ journey: f.request(), route: f.route });
    f.step(10);
    const snap = new Simulation(f.s.settings).snapshot();
    Object.assign(snap, {
      nodes: f.s.nodes,
      segments: f.s.segments,
      buildings: f.s.buildings,
      citizens: f.c,
      nextId: 10003,
      clock: { ...f.s.clock, day: 1, tickInDay: 0 },
      traffic: f.traffic.snapshot(),
    });
    const restored = await deserialize(await serialize(snap));
    expect(restored.traffic).toEqual(snap.traffic);
    expect(restored.traffic.routes[0]!.legs[0]!.points).toBeUndefined();
    const old = structuredClone(snap);
    Reflect.deleteProperty(old, 'traffic');
    expect(migrateSave(old, 1).traffic.vehicles).toHaveLength(0);
    const broken = structuredClone(snap);
    broken.traffic.vehicles[0]!.distance = 1e9;
    expect(() => migrateSave(broken, 1)).toThrow();
    const duplicates = structuredClone(snap);
    duplicates.traffic.vehicles.push(
      structuredClone(duplicates.traffic.vehicles[0]!),
    );
    expect(() => migrateSave(duplicates, 1)).toThrow();
  });
  it('emits transferable packed positions every 50 ms, including one empty frame to clear ended traffic', () => {
    const f = fixture();
    f.traffic.spawn({ journey: f.request(), route: f.route });
    const frame = f.traffic.frame();
    const count = vi
      .spyOn(TrafficSystem.prototype, 'count', 'get')
      .mockReturnValue(1);
    const frames = vi
      .spyOn(TrafficSystem.prototype, 'frame')
      .mockReturnValue(frame);
    try {
      const events: SimEvent[] = [],
        d = new CommandDispatcher((e) => events.push(e));
      d.handle({ t: 'init', reqId: 1, ...f.s.settings });
      events.length = 0;
      d.advance(49);
      expect(events.filter((e) => e.t === 'vehicles')).toHaveLength(0);
      d.advance(1);
      expect(events.filter((e) => e.t === 'vehicles')).toHaveLength(1);
      const event = events.find((e) => e.t === 'vehicles')!;
      if (event.t !== 'vehicles') throw new Error();
      expect(event.count).toBe(1);
      expect(event.data.length).toBe(10);
      const buffer = event.data.buffer;
      const cloned = structuredClone(event, { transfer: [buffer] });
      expect(buffer.byteLength).toBe(0);
      expect(cloned.data[1]).toBe(1);
      count.mockReturnValue(0);
      frames.mockReturnValue({ count: 0, data: new Float32Array() });
      d.advance(50);
      d.advance(50);
      expect(events.filter((e) => e.t === 'vehicles')).toHaveLength(2);
      expect(events.at(-1)).toMatchObject({ t: 'vehicles', count: 0 });
    } finally {
      count.mockRestore();
      frames.mockRestore();
    }
  });
  it('follows a lane-change curve continuously between successive left and right turns', () => {
    const f = fixture(),
      g = new RoadGraph();
    for (const [ax, az, bx, bz] of [
      [-200, 0, 0, 0],
      [0, 0, 0, -200],
      [0, -200, 200, -200],
    ])
      g.addRoad({
        start: { x: ax!, z: az! },
        end: { x: bx!, z: bz! },
        type: 'road_medium',
        builtDay: 0,
        startHeight: 60,
        endHeight: 60,
      });
    Object.assign(f.s, g.snapshot());
    f.lanes.sync(f.s.nodes, f.s.segments);
    f.traffic.networkChanged();
    const a = [...f.lanes.lanes.values()].find(
      (l) => l.points[0]!.x < -150 && l.direction === 1 && l.index === 0,
    )!;
    const ends = [...f.lanes.lanes.values()].filter(
      (l) => l.points.at(-1)!.x > 150 && l.direction === 1,
    );
    const route = f.planner.paths.between(
      [{ lane: a.id, distance: 20 }],
      ends.map((l) => ({ lane: l.id, distance: l.length - 20 })),
    )!;
    expect(route.legs.some((l) => l.kind === 'laneChange')).toBe(true);
    f.traffic.spawn({ journey: f.request(), route });
    let previous = f.traffic.inspect(1)!;
    let changed = false;
    for (let i = 0; i < 400 && f.traffic.count; i++) {
      f.step(1, 0.06);
      const now = f.traffic.inspect(1);
      if (now) {
        expect(Math.hypot(now.x - previous.x, now.z - previous.z)).toBeLessThan(
          5,
        );
        previous = now;
        const saved = f.traffic.snapshot().vehicles[0]!;
        if (route.legs[saved.leg]!.kind === 'laneChange') changed = true;
      }
    }
    expect(changed).toBe(true);
    expect(f.traffic.snapshot().arrived).toBe(1);
  });
  it('processes 3000 actual lane followers within the 8 ms worker budget', () => {
    const f = fixture(3000, 1500);
    f.roads.removeSegment(f.s.segments[0]!.id);
    for (let row = 0; row < 60; row++)
      f.roads.addRoad({
        start: { x: -1500, z: row * 30 },
        end: { x: 1500, z: row * 30 },
        type: 'road_small',
        builtDay: 0,
        startHeight: 60,
        endHeight: 60,
      });
    Object.assign(f.s, f.roads.snapshot());
    f.lanes.sync(f.s.nodes, f.s.segments);
    f.traffic.networkChanged();
    const lanes = [...f.lanes.lanes.values()].filter((l) => l.direction === 1);
    for (let i = 0; i < 3000; i++) {
      const start = 100 + (i % 50) * 16,
        lane = lanes[Math.floor(i / 50)]!;
      const route: Route = {
        revision: f.lanes.revision,
        mode: 'drive',
        length: lane.length - start - 10,
        costSeconds: 5000,
        legs: [
          {
            id: `perf-${i}`,
            kind: 'lane',
            lane: lane.id,
            segment: lane.segment,
            length: lane.length - start - 10,
            startDistance: start,
            speedMps: 10,
            points: lane.points,
          },
        ],
      };
      expect(f.traffic.spawn({ journey: f.request(i), route })).toBe(true);
    }
    expect(f.traffic.count).toBe(3000);
    f.step(30);
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      f.step();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(8);
    expect(f.traffic.count).toBe(3000);
    expect(f.traffic.frame().data.length).toBe(
      3000 * TRAFFIC_RUNTIME.streamStride,
    );
  });
});
