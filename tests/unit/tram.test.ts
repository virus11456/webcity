import { it, expect } from 'vitest';
import { busState, busStops } from '../fixtures/busCity';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { TransitSystem } from '../../src/sim/systems/transit';
import { serialize, deserialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
import { weeklyAccounts } from '../../src/sim/systems/economy';
function setup() {
  const s = busState(),
    graph = new LaneGraph();
  graph.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, graph, schedules),
    traffic = new TrafficSystem(s, graph, planner, schedules, s.traffic),
    transit = new TransitSystem(s, planner, traffic, schedules);
  const step = () => {
    s.clock.ticks++;
    planner.tick();
    traffic.step(0.24, s.clock.ticks * 0.24);
    transit.tick();
  };
  return { s, graph, planner, traffic, transit, step };
}
it('quotes road rails without mutation, charges once and shares depot slots with buses', () => {
  const x = setup();
  x.s.settings.mode = 'normal';
  const before = x.s.money,
    id = x.s.nextId;
  const quote = x.transit.create(busStops, 'tram', true);
  expect(quote.ok).toBe(true);
  expect(quote.cost).toBeGreaterThan(0);
  expect(x.s.nextId).toBe(id);
  expect(x.s.money).toBe(before);
  expect(x.s.transitLines).toHaveLength(0);
  x.s.money = 0;
  expect(x.transit.create(busStops, 'tram').reason).toBe('err.notEnoughMoney');
  expect(x.s.nextId).toBe(id);
  x.s.money = before;
  expect(x.transit.create(busStops, 'tram').cost).toBe(quote.cost);
  expect(x.s.money).toBe(before - quote.cost!);
  const line = x.s.transitLines[0]!,
    ids = new Set(line.tracks!.map((t) => t.segment));
  expect(quote.cost).toBe(
    x.s.segments
      .filter((s) => ids.has(s.id))
      .reduce((n, s) => n + Math.ceil(s.length / 8) * 30, 0),
  );
  x.transit.setVehicles(line.id, 20);
  expect(x.transit.create(busStops).reason).toBe('err.busCapacity');
});
it('uses actual road lane occupancy, carries individual riders and records tram fares and upkeep', () => {
  const x = setup();
  expect(x.transit.create(busStops, 'tram').ok).toBe(true);
  x.step();
  const initial = x.traffic.snapshot(),
    train = initial.vehicles.find((v) => v.kind === 10)!;
  expect(train).toBeDefined();
  const route = x.planner.paths.restoreRoute(initial.routes[train.route]!)!;
  expect(x.graph.lanes.has(route.legs[0]!.lane!)).toBe(true);
  // A car cannot spawn in the lane slot already occupied by a tram.
  const mission = x.traffic.reserveMission();
  expect(
    x.traffic.spawnMission(
      {
        route,
        journey: {
          citizenId: -mission,
          originId: 0,
          destinationId: 0,
          purpose: 6,
          mode: 1,
          requestedTick: x.s.clock.ticks,
        },
      },
      0,
    ),
  ).toBe(false);
  let arrived = false;
  for (let i = 0; i < 1500; i++) {
    x.step();
    const l = x.s.transitLines[0]!;
    for (const b of l.buses)
      expect(
        l.riders.filter((p) => p.stage === 'riding' && p.bus === b.id).length,
      ).toBeLessThanOrEqual(90);
    if (
      l.passengers &&
      Array.from(
        x.s.citizens.locationId.subarray(0, x.s.citizens.count),
      ).includes(x.s.buildings[1]!.id)
    ) {
      arrived = true;
      break;
    }
  }
  expect(arrived).toBe(true);
  const l = x.s.transitLines[0]!;
  expect(l.revenue).toBe(l.passengers * 3);
  expect(weeklyAccounts(x.s).upkeep.transit).toBe(300 + l.buses.length * 60);
});
it('saves passengers, rails and tram progress, and rejects missing track metadata', async () => {
  const x = setup();
  x.transit.create(busStops, 'tram');
  for (let i = 0; i < 1000 && !x.s.transitLines[0]!.passengers; i++) x.step();
  expect(x.s.transitLines[0]!.passengers).toBeGreaterThan(0);
  x.s.traffic = x.traffic.snapshot();
  const saved = await deserialize(await serialize(x.s));
  const sim = new Simulation(saved.settings, undefined, saved),
    restored = sim.snapshot();
  expect(restored.transitLines[0]!.passengers).toBe(
    saved.transitLines[0]!.passengers,
  );
  expect(restored.traffic.vehicles.some((v) => v.kind === 10)).toBe(true);
  const bad = structuredClone(saved);
  bad.transitLines[0]!.tracks = [];
  await expect(deserialize(await serialize(bad))).rejects.toThrow();
});
it('stops rather than inventing replacement track after road removal and deletes physical trams', () => {
  const x = setup();
  x.transit.create(busStops, 'tram');
  x.step();
  const l = x.s.transitLines[0]!;
  x.s.nodes = [];
  x.s.segments = [];
  x.graph.sync([], []);
  x.traffic.networkChanged();
  x.transit.networkChanged();
  expect(l.blocked).toBe(true);
  expect(l.buses).toHaveLength(0);
  expect(x.transit.delete(l.id).ok).toBe(true);
  expect(x.traffic.snapshot().vehicles.some((v) => v.kind === 10)).toBe(false);
});
