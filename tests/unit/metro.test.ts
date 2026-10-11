import { it, expect } from 'vitest';
import { metroState, metroStops } from '../fixtures/metroCity';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { TransitSystem } from '../../src/sim/systems/transit';
import { serialize, deserialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
import { metroTrackCost, metroLandValid } from '../../src/world/metro';
import { weeklyAccounts } from '../../src/sim/systems/economy';
function setup() {
  const s = metroState(),
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
it('charges track lengths atomically, enforces station/land/unlock and one train per independent line', () => {
  const x = setup();
  x.s.settings.mode = 'normal';
  x.s.unlocked = [0];
  expect(x.transit.create(metroStops, 'metro').reason).toBe('err.locked');
  x.s.unlocked.push(7);
  x.s.money = 0;
  expect(x.transit.create(metroStops, 'metro').reason).toBe(
    'err.notEnoughMoney',
  );
  expect(x.s.transitLines).toHaveLength(0);
  x.s.money = 50000;
  expect(
    x.transit.create([{ x: 0, z: 0 }, metroStops[0]!], 'metro').reason,
  ).toBe('err.metroStations');
  const result = x.transit.create(metroStops, 'metro');
  expect(result.ok).toBe(true);
  expect(result.cost).toBe(metroTrackCost(metroStops));
  expect(x.s.money).toBe(50000 - result.cost!);
  expect(x.transit.setVehicles(x.s.transitLines[0]!.id, 2).ok).toBe(false);
  expect(
    metroLandValid(
      [
        { x: -140, z: -104 },
        { x: 1400, z: 0 },
      ],
      x.s.ownedTiles,
    ),
  ).toBe(false);
});
it('moves a real train underground, boards residents and completes their walk to work', () => {
  const x = setup();
  expect(x.transit.create(metroStops, 'metro').ok).toBe(true);
  let moved = false,
    arrived = false;
  for (let i = 0; i < 1200; i++) {
    x.step();
    const trains = x.traffic.snapshot().vehicles.filter((v) => v.kind === 9);
    moved ||= trains.some(
      (v) => v.speed > 0 && v.y === 48 && Math.abs(v.x) < 130,
    );
    const l = x.s.transitLines[0]!;
    expect(
      l.riders.filter((p) => p.stage === 'riding').length,
    ).toBeLessThanOrEqual(180);
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
  expect(moved).toBe(true);
  expect(arrived).toBe(true);
  const l = x.s.transitLines[0]!;
  expect(l.revenue).toBe(l.passengers * 4);
  expect(weeklyAccounts(x.s).upkeep.transit).toBe(2 * 360 + 120);
});
it('restores train progress and individual riders without duplicating fares', async () => {
  const x = setup();
  x.transit.create(metroStops, 'metro');
  for (let i = 0; i < 800 && !x.s.transitLines[0]!.passengers; i++) x.step();
  expect(x.s.transitLines[0]!.passengers).toBeGreaterThan(0);
  x.s.traffic = x.traffic.snapshot();
  const saved = await deserialize(await serialize(x.s));
  const sim = new Simulation(saved.settings, undefined, saved),
    restored = sim.snapshot();
  expect(restored.transitLines[0]!.riders).toEqual(
    saved.transitLines[0]!.riders,
  );
  expect(restored.economy.transitUnsettled).toBe(
    saved.economy.transitUnsettled,
  );
  expect(restored.traffic.vehicles.find((v) => v.kind === 9)?.x).toBe(
    saved.traffic.vehicles.find((v) => v.kind === 9)?.x,
  );
  const bad = structuredClone(saved);
  bad.transitLines[0]!.stationIds![0] = bad.buildings[0]!.id;
  await expect(deserialize(await serialize(bad))).rejects.toThrow();
  bad.transitLines[0]!.stationIds = saved.transitLines[0]!.stationIds;
  bad.transitLines[0]!.vehicles = 2;
  await expect(deserialize(await serialize(bad))).rejects.toThrow();
});
it('closes a line on station shutdown and restarts after enabling, with fares preserved on deletion', () => {
  const x = setup();
  x.transit.create(metroStops, 'metro');
  for (let i = 0; i < 800 && !x.s.transitLines[0]!.passengers; i++) x.step();
  const l = x.s.transitLines[0]!,
    fare = x.s.economy.transitUnsettled;
  x.s.buildings[3]!.enabled = false;
  x.step();
  expect(l.blocked).toBe(true);
  expect(l.riders).toHaveLength(0);
  expect(x.traffic.snapshot().vehicles.some((v) => v.kind === 9)).toBe(false);
  x.s.buildings[3]!.enabled = true;
  x.step();
  expect(l.blocked).toBe(false);
  expect(l.buses).toHaveLength(1);
  x.transit.delete(l.id);
  expect(x.s.economy.transitUnsettled).toBe(fare);
  expect(x.traffic.snapshot().vehicles.some((v) => v.kind === 9)).toBe(false);
});
