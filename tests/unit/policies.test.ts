import { it, expect } from 'vitest';
import { busState, busStops } from '../fixtures/busCity';
import { POLICIES } from '../../src/data/policies';
import { BUILDINGS } from '../../src/data/buildings';
import {
  setPolicy,
  updateGarbageProduction,
} from '../../src/sim/systems/policies';
import {
  hasPolicy,
  policyFee,
  garbageRate,
  busChoiceProbability,
  truckBannedRoads,
} from '../../src/world/policies';
import { districtBrush } from '../../src/world/districts';
import { updatePower } from '../../src/sim/systems/power';
import { updateWater } from '../../src/sim/systems/water';
import { updateHealth } from '../../src/sim/systems/health';
import { updateHappiness } from '../../src/sim/systems/happiness';
import { updateLevels, upgradeStatus } from '../../src/sim/systems/levels';
import { weeklyAccounts, moneyRound } from '../../src/sim/systems/economy';
import { generateBuilding } from '../../src/render/buildings/generator';
import { createState } from '../../src/sim/state';
import { CitizenSystem } from '../../src/sim/systems/citizens';
import { updatePopulation } from '../../src/sim/systems/population';
import { initialHousing } from '../../src/world/population';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { ZONE_CODES, ZONES, type ZoneType } from '../../src/data/zones';
import { GrowthSystem } from '../../src/sim/systems/growth';
import { Simulation } from '../../src/sim/simulation';
import { serialize, deserialize } from '../../src/save/serializer';
import { LaneGraph } from '../../src/world/laneGraph';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { TransitSystem } from '../../src/sim/systems/transit';
import { CommandDispatcher } from '../../src/sim/commands';
import type { SimEvent } from '../../src/bridge/protocol';
function transitSetup() {
  const s = busState(),
    graph = new LaneGraph();
  graph.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, graph, schedules),
    traffic = new TrafficSystem(s, graph, planner, schedules, s.traffic),
    transit = new TransitSystem(s, planner, traffic, schedules);
  return {
    s,
    graph,
    planner,
    traffic,
    transit,
    step() {
      s.clock.ticks++;
      planner.tick();
      traffic.step(0.24, s.clock.ticks * 0.24);
      transit.tick();
    },
  };
}
function schoolFixture(people = 400, level = 0) {
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
function growthFixture(zone: ZoneType = 'RL') {
  const s = createState({
    seed: 42,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: 'Growth',
  });
  s.terrain.heights.fill(60);
  s.nextId = 10;
  s.nodes = [
    {
      id: 1,
      pos: { x: -160, z: 0 },
      height: 60,
      segments: [3],
      control: 'none',
    },
    {
      id: 2,
      pos: { x: 160, z: 0 },
      height: 60,
      segments: [3],
      control: 'none',
    },
  ];
  s.segments = [
    {
      id: 3,
      type: 'road_small',
      start: 1,
      end: 2,
      c1: { x: -50, z: 0 },
      c2: { x: 50, z: 0 },
      length: 320,
      elevated: false,
      builtDay: 0,
      zoneBlockIds: [4],
    },
  ];
  s.zoneBlocks = [
    {
      id: 4,
      segment: 3,
      side: 1,
      origin: { x: -152, z: 8 },
      dir: { x: 1, z: 0 },
      width: 38,
      cells: new Uint8Array(152).fill(ZONE_CODES[zone]),
      buildingAt: new Int32Array(152).fill(-1),
    },
  ];
  s.stats.demand = { R: 0, C: 0, I: 0, O: 0 };
  s.stats.demand[ZONES[zone].demand] = 100;
  return s;
}

it('district override/inheritance is explicit, lock validated and overlapping policy fees count each household once', () => {
  const s = busState(),
    home = s.buildings[0]!;
  s.districts = [
    {
      id: s.nextId++,
      name: 'Home',
      cells: districtBrush([home.pos], 96, s.ownedTiles),
    },
  ];
  const id = s.districts[0]!.id;
  s.settings.mode = 'normal';
  s.unlocked = [0];
  expect(setPolicy(s, 'energy_saving', null, true).reason).toBe('err.locked');
  s.settings.mode = 'sandbox';
  setPolicy(s, 'energy_saving', null, true);
  setPolicy(s, 'energy_saving', id, true);
  expect(policyFee(s, s.buildings)).toBeCloseTo(home.housing!.occupied * 0.2);
  setPolicy(s, 'energy_saving', id, false);
  expect(hasPolicy(s, 'energy_saving', home.pos)).toBe(false);
  expect(policyFee(s, s.buildings)).toBe(0);
  setPolicy(s, 'energy_saving', id, null);
  expect(hasPolicy(s, 'energy_saving', home.pos)).toBe(true);
  expect(setPolicy(s, 'energy_saving', 999, true).ok).toBe(false);
  expect(setPolicy(s, 'energy_saving', null, null).ok).toBe(false);
});
it('energy and water saving reduce physical network loads by exactly 15 percent', () => {
  const s = busState();
  updatePower(s);
  updateWater(s);
  const power = s.stats.power.consumed,
    water = s.stats.water.consumed;
  setPolicy(s, 'energy_saving', null, true);
  setPolicy(s, 'water_saving', null, true);
  updatePower(s);
  updateWater(s);
  expect(s.stats.power.consumed).toBeCloseTo(power * 0.85);
  expect(s.stats.water.consumed).toBeCloseTo(water * 0.85);
});
it('smoking ban increases effective health by 10 percent without compounding raw health; happiness drops by two', () => {
  const s = busState(),
    b = s.buildings[0]!;
  s.citizens.health.fill(50);
  b.flags = 7;
  b.coverage = { health: 1, police: 1, fire: 1, education: 1 };
  updateHealth(s);
  updateHappiness(s);
  const happy = b.happiness!;
  expect(b.health!.average).toBe(50);
  setPolicy(s, 'smoking_ban', null, true);
  updateHealth(s);
  updateHealth(s);
  updateHappiness(s);
  expect(b.health!.average).toBeCloseTo(55);
  expect(s.citizens.health[0]).toBe(50);
  expect(b.happiness).toBe(happy - 2);
  setPolicy(s, 'smoking_ban', null, false);
  updateHealth(s);
  expect(b.health!.average).toBe(50);
});
it('recycling reduces actual durable daily garbage by 20 percent and does not recollect a day on refresh', () => {
  const s = busState(),
    b = s.buildings[0]!,
    baseline = garbageRate(s, b);
  setPolicy(s, 'recycling_plan', null, true);
  updateGarbageProduction(s, true);
  expect(b.garbage!.stock).toBeCloseTo(baseline * 0.8);
  updateGarbageProduction(s, true);
  expect(b.garbage!.stock).toBeCloseTo(baseline * 0.8);
  s.clock.day++;
  updateGarbageProduction(s, true);
  expect(b.garbage!.stock).toBeCloseTo(baseline * 1.6);
});
it('free bus raises choice probability 30 percent and real boardings earn no fare, with metro/tram excluded', () => {
  const x = transitSetup();
  expect(busChoiceProbability(x.s, x.s.buildings[0]!.pos)).toBe(0.7);
  setPolicy(x.s, 'free_bus', null, true);
  expect(busChoiceProbability(x.s, x.s.buildings[0]!.pos)).toBeCloseTo(0.91);
  expect(x.transit.create(busStops).ok).toBe(true);
  for (let i = 0; i < 1800 && !x.s.transitLines[0]!.passengers; i++) x.step();
  expect(x.s.transitLines[0]!.passengers).toBeGreaterThan(0);
  expect(x.s.transitLines[0]!.revenue).toBe(0);
  expect(x.s.economy.transitUnsettled ?? 0).toBe(0);
});
it('heavy vehicle ban excludes local roads from truck A*, keeps cars routable and strands a truck without delivering its cargo', () => {
  const x = transitSetup(),
    starts = x.planner.paths.access(x.s.buildings[0]!.pos, 'drive', 16),
    goals = x.planner.paths.access(x.s.buildings[1]!.pos, 'drive', 16),
    route = x.planner.paths.between(starts, goals, 'drive')!;
  expect(route).toBeTruthy();
  const id = x.traffic.reserveMission();
  expect(
    x.traffic.spawnMission(
      {
        route,
        journey: {
          citizenId: -id,
          originId: 100,
          destinationId: 101,
          purpose: 6,
          mode: 1,
          requestedTick: 0,
        },
      },
      2,
    ),
  ).toBe(true);
  const pos = x.traffic.missionPosition(id);
  setPolicy(x.s, 'heavy_vehicle_ban', null, true);
  const forbidden = truckBannedRoads(x.s, x.s.nodes, x.s.segments);
  expect(forbidden.size).toBe(4);
  expect(x.planner.paths.between(starts, goals, 'drive', forbidden)).toBeNull();
  expect(x.planner.paths.between(starts, goals, 'drive')).not.toBeNull();
  x.traffic.restrictMission(id, forbidden);
  expect(x.traffic.hasMission(id)).toBe(false);
  expect(x.traffic.missionPosition(id)).toEqual(pos);
  expect(x.traffic.takeMissionArrivals()).toEqual([]);
});
it('pet ban cuts park upkeep by 10 percent and household happiness by one', () => {
  const s = busState(),
    b = s.buildings[0]!,
    def = BUILDINGS.find((b) => b.id === 'park_small')!;
  s.buildings.push({
    ...structuredClone(b),
    id: s.nextId++,
    kind: 'park',
    defId: def.id,
    housing: undefined,
    residents: 0,
    households: 0,
  });
  b.flags = 7;
  updateHappiness(s);
  const happy = b.happiness!,
    before = weeklyAccounts(s).upkeep.parks;
  setPolicy(s, 'pet_ban', null, true);
  expect(weeklyAccounts(s).upkeep.parks).toBeCloseTo(before * 0.9);
  updateHappiness(s);
  expect(b.happiness).toBe(happy - 1);
});
it('education campaign graduates enrolled pupils in ceil(30/1.1) days while ordinary pupils still need 30', () => {
  for (const enabled of [false, true]) {
    const { s, c, system } = schoolFixture(10);
    c.schoolDays.fill(27);
    if (enabled) setPolicy(s, 'education_campaign', null, true);
    s.clock.day = 1;
    system.daily();
    expect(c.education[0]).toBe(enabled ? 1 : 0);
  }
});
it('high-tech housing lowers only the residential land threshold by ten', () => {
  const s = busState(),
    b = s.buildings[0]!;
  b.level = 1;
  b.flags = 7;
  const base = upgradeStatus(b, s).landRequired;
  setPolicy(s, 'high_tech_housing', null, true);
  expect(upgradeStatus(b, s).landRequired).toBe(base - 10);
  const work = s.buildings[1]!;
  work.level = 1;
  expect(upgradeStatus(work, s).landRequired).toBe(
    upgradeStatus(work).landRequired,
  );
});
it('no highrises caps authoritative level at three and generated floors at four', () => {
  const s = busState(),
    b = s.buildings[0]!;
  setPolicy(s, 'no_highrises', null, true);
  updateLevels(s);
  expect(b.level).toBe(3);
  expect(b.floorLimit).toBe(4);
  expect(upgradeStatus(b, s).target).toBe(3);
  const geometry = generateBuilding(
    'RH',
    b.level,
    4,
    4,
    b.seed,
    true,
    b.floorLimit,
  );
  expect(geometry.userData.floors).toBeLessThanOrEqual(4);
  geometry.dispose();
  setPolicy(s, 'no_highrises', null, false);
  updateLevels(s);
  expect(b.floorLimit).toBeUndefined();
});
it('small-business policy adds ten CL demand points in actual growth and discounts only CL tax', () => {
  const baseline = growthFixture('CL');
  baseline.stats.demand.C = 10;
  expect(new GrowthSystem().tick(baseline).added).toHaveLength(0);
  setPolicy(baseline, 'small_business', null, true);
  expect(new GrowthSystem().tick(baseline).added.length).toBeGreaterThan(0);
  const high = growthFixture('CH');
  high.stats.demand.C = 10;
  setPolicy(high, 'small_business', null, true);
  expect(new GrowthSystem().tick(high).added).toHaveLength(0);
  const s = busState(),
    b = s.buildings[1]!;
  b.defId = 'CL';
  const before = weeklyAccounts(s).taxIncome.CL;
  setPolicy(s, 'small_business', null, true);
  expect(weeklyAccounts(s).taxIncome.CL).toBe(moneyRound(before * 0.9));
  b.defId = 'CH';
  expect(weeklyAccounts(s).taxIncome.CH).toBe(before);
});
it('saves all policy states and production, records recurring ledger cost and validates the Worker command boundary', async () => {
  const s = busState();
  for (const p of POLICIES) setPolicy(s, p.id, null, true);
  updateGarbageProduction(s, true);
  const a = weeklyAccounts(s);
  expect(a.policyExpenses).toBeCloseTo(s.buildings[0]!.housing!.occupied * 1.4);
  const saved = await deserialize(await serialize(s));
  expect(saved.policies).toEqual(s.policies);
  expect(saved.buildings[0]!.garbage).toEqual(s.buildings[0]!.garbage);
  const bad = structuredClone(saved);
  bad.districts = [
    {
      id: bad.nextId++,
      name: 'A',
      cells: [],
      policies: { energy_saving: 'yes' as never },
    },
  ];
  await expect(deserialize(await serialize(bad))).rejects.toThrow();
  const events: SimEvent[] = [],
    dispatcher = new CommandDispatcher((e) => events.push(e));
  dispatcher.handle({
    t: 'init',
    reqId: 1,
    seed: 1,
    mapId: 'valley',
    cityName: 'A',
    mode: 'sandbox',
  });
  dispatcher.handle({
    t: 'setPolicy',
    reqId: 2,
    policy: 'energy_saving',
    district: null,
    on: true,
  });
  expect(events.at(-1)).toMatchObject({ ok: true });
  expect(
    events.some(
      (e) => e.t === 'policies' && e.policies.includes('energy_saving'),
    ),
  ).toBe(true);
  const sim = new Simulation(s.settings, undefined, s);
  expect(sim.snapshot().buildings[0]!.floorLimit).toBe(4);
});
