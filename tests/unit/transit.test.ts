import { describe, it, expect } from 'vitest';
import { busState, busStops } from '../fixtures/busCity';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { TransitSystem } from '../../src/sim/systems/transit';
import { settleEconomy, weeklyAccounts } from '../../src/sim/systems/economy';
import { serialize, deserialize } from '../../src/save/serializer';
import { JourneyStatus } from '../../src/world/schedules';
import { Simulation } from '../../src/sim/simulation';
function setup(s = busState()) {
  const graph = new LaneGraph();
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
describe('bus system', () => {
  it('validates closed routes, depot access, and fleet capacity before mutating', () => {
    const { s, transit } = setup();
    const before = s.nextId;
    expect(transit.create([busStops[0]!]).ok).toBe(false);
    expect(s.nextId).toBe(before);
    expect(transit.create([busStops[0]!, { x: 2000, z: 2000 }]).ok).toBe(false);
    s.buildings[2]!.enabled = false;
    expect(transit.create(busStops).reason).toBe('err.busDepot');
    s.buildings[2]!.enabled = true;
    expect(transit.create(busStops).ok).toBe(true);
    const l = s.transitLines[0]!;
    expect(l.vehicles).toBe(Math.ceil(l.length / 800));
    expect(transit.setVehicles(l.id, 21).reason).toBe('err.busCapacity');
    expect(transit.setVehicles(l.id, -1).ok).toBe(false);
    expect(transit.setVehicles(l.id, 20).ok).toBe(true);
    const secondDepot = {
      ...structuredClone(s.buildings[2]!),
      id: s.nextId++,
      pos: { x: 0, z: -104 },
    };
    s.buildings.push(secondDepot);
    expect(transit.create(busStops).ok).toBe(true);
    expect(s.transitLines[1]!.depot).toBe(secondDepot.id);
  });
  it('walks real citizens to stops, boards at most 30, rides physical buses and walks to work', () => {
    const x = setup();
    expect(x.transit.create(busStops).ok).toBe(true);
    let boarded = false,
      arrived = false;
    const l = x.s.transitLines[0]!;
    for (let i = 0; i < 1500; i++) {
      x.step();
      for (const b of l.buses)
        expect(
          l.riders.filter((p) => p.stage === 'riding' && p.bus === b.id).length,
        ).toBeLessThanOrEqual(30);
      if (l.passengers) boarded = true;
      if (
        boarded &&
        Array.from(
          x.s.citizens.locationId.subarray(0, x.s.citizens.count),
        ).includes(x.s.buildings[1]!.id)
      ) {
        arrived = true;
        break;
      }
    }
    expect(boarded).toBe(true);
    expect(arrived).toBe(true);
    expect(l.revenue).toBe(l.passengers * 2);
    expect(x.s.economy.transitUnsettled).toBe(l.revenue);
    expect(weeklyAccounts(x.s).upkeep.transit).toBe(300 + l.buses.length * 40);
    const revenue = l.revenue;
    x.s.clock.day = 7;
    settleEconomy(x.s);
    expect(x.s.economy.transitIncome).toBe(revenue);
    expect(x.s.economy.transitUnsettled).toBe(0);
    settleEconomy(x.s);
    expect(x.s.economy.transitIncome).toBe(revenue);
  });
  it('releases riders at physical positions when a line is deleted without losing earned fares', () => {
    const x = setup();
    x.transit.create(busStops);
    for (let i = 0; i < 800 && !x.s.transitLines[0]!.passengers; i++) x.step();
    const l = x.s.transitLines[0]!;
    expect(l.passengers).toBeGreaterThan(0);
    const revenue = x.s.economy.transitUnsettled;
    const rider = l.riders.find((p) => p.stage === 'riding')!;
    expect(rider).toBeDefined();
    expect(x.transit.delete(l.id).ok).toBe(true);
    expect(x.s.transitLines).toHaveLength(0);
    expect(x.s.economy.transitUnsettled).toBe(revenue);
    const i = x.s.citizens.id.indexOf(rider.journey.citizenId);
    expect(x.s.citizens.tripStatus[i]).toBe(JourneyStatus.blocked);
    expect(
      x.traffic.snapshot().vehicles.filter((v) => v.kind === 2),
    ).toHaveLength(0);
  });
  it('preserves riders and physical missions through save/load and rejects corrupt ownership', async () => {
    const x = setup();
    x.transit.create(busStops);
    for (let i = 0; i < 800 && !x.s.transitLines[0]!.passengers; i++) x.step();
    x.s.traffic = x.traffic.snapshot();
    const saved = await deserialize(await serialize(x.s));
    expect(saved.transitLines[0]!.passengers).toBeGreaterThan(0);
    const sim = new Simulation(saved.settings, undefined, saved);
    expect(sim.snapshot().transitLines[0]!.riders.length).toBe(
      saved.transitLines[0]!.riders.length,
    );
    const bad = structuredClone(saved);
    bad.transitLines[0]!.riders[0]!.journey.citizenId = 999999;
    await expect(deserialize(await serialize(bad))).rejects.toThrow();
  });
  it('stops service and releases passengers when the depot is disabled', () => {
    const x = setup();
    x.transit.create(busStops);
    for (let i = 0; i < 20; i++) x.step();
    x.s.buildings[2]!.enabled = false;
    expect(x.transit.setVehicles(x.s.transitLines[0]!.id, 1).ok).toBe(true);
    x.step();
    expect(x.s.transitLines[0]!.buses).toHaveLength(0);
    expect(x.s.transitLines[0]!.riders).toHaveLength(0);
  });
  it('uses the bus for the return home journey as well', () => {
    const x = setup();
    x.transit.create(busStops);
    const boarded = new Set<number>();
    let row = -1;
    for (let n = 0; n < 1500 && row < 0; n++) {
      x.step();
      for (const p of x.s.transitLines[0]!.riders)
        if (p.stage === 'riding') boarded.add(p.journey.citizenId);
      row = Array.from(
        x.s.citizens.locationId.subarray(0, x.s.citizens.count),
      ).findIndex(
        (id, i) =>
          id === x.s.buildings[1]!.id && boarded.has(x.s.citizens.id[i]!),
      );
    }
    expect(row).toBeGreaterThanOrEqual(0);
    const c = x.s.citizens;
    c.tripOriginId[row] = x.s.buildings[1]!.id;
    c.destinationId[row] = c.homeId[row]!;
    c.tripPurpose[row] = 3;
    c.tripStartTick[row] = x.s.clock.ticks;
    c.tripStatus[row] = 1;
    let rode = false;
    for (let n = 0; n < 1500 && c.locationId[row] !== c.homeId[row]; n++) {
      x.step();
      rode ||= x.s.transitLines[0]!.riders.some(
        (p) => p.journey.citizenId === c.id[row] && p.stage === 'riding',
      );
    }
    expect(rode).toBe(true);
    expect(c.locationId[row]).toBe(c.homeId[row]);
    expect(c.tripStatus[row]).toBe(0);
  });
  it('releases and persists actual stranded positions after road demolition, then restores service', async () => {
    const x = setup();
    x.transit.create(busStops);
    for (let i = 0; i < 800 && !x.s.transitLines[0]!.passengers; i++) x.step();
    const segments = x.s.segments,
      nodes = x.s.nodes;
    x.s.segments = [];
    x.s.nodes = [];
    x.graph.sync([], []);
    x.traffic.networkChanged();
    x.transit.networkChanged();
    expect(x.s.transitLines[0]!.blocked).toBe(true);
    expect(x.s.transitLines[0]!.riders).toHaveLength(0);
    x.s.traffic = x.traffic.snapshot();
    expect(x.s.traffic.stranded.some((p) => p.journey.citizenId > 0)).toBe(
      true,
    );
    const restored = await deserialize(await serialize(x.s));
    expect(restored.traffic.stranded).toEqual(x.s.traffic.stranded);
    x.s.segments = segments;
    x.s.nodes = nodes;
    x.graph.sync(nodes, segments);
    x.traffic.networkChanged();
    x.transit.networkChanged();
    x.transit.tick();
    expect(x.s.transitLines[0]!.blocked).toBe(false);
    expect(x.s.transitLines[0]!.buses.length).toBeGreaterThan(0);
  });
  it('rejects orphaned transit missions and forged fare balances on load', async () => {
    const x = setup();
    x.transit.create(busStops);
    x.step();
    x.s.traffic = x.traffic.snapshot();
    const orphan = structuredClone(x.s);
    orphan.traffic.vehicles = orphan.traffic.vehicles.filter(
      (v) => v.kind !== 2,
    );
    await expect(deserialize(await serialize(orphan))).rejects.toThrow();
    const balance = structuredClone(x.s);
    balance.economy.transitUnsettled = -1;
    await expect(deserialize(await serialize(balance))).rejects.toThrow();
  });
});
