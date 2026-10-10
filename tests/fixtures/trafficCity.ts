import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { updatePopulation } from '../../src/sim/systems/population';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { RoadGraph } from '../../src/world/roadGraph';
import { LaneGraph } from '../../src/world/laneGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { buildingCapacity, initialHousing } from '../../src/world/population';
import {
  JourneyStatus,
  JourneyPurpose,
  TravelMode,
} from '../../src/world/schedules';
import { CitizenState } from '../../src/world/citizens';
import { serialize } from '../../src/save/serializer';
import type { RoadTypeId } from '../../src/data/roads';
/** Valid paused save with individual employed residents already on actual lane routes. */
export async function trafficCity(count = 1000) {
  const settings = {
    seed: 20261006,
    mapId: 'valley',
    mode: 'sandbox' as const,
    cityName: '每天上班的城市',
  };
  const s = createState(settings);
  s.terrain.heights.fill(60);

  const roads = new RoadGraph();
  const road = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    type: RoadTypeId = 'road_large',
  ) =>
    roads.addRoad({
      start: { x: ax, z: az },
      end: { x: bx, z: bz },
      type,
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
  for (let row = 0; row < 6; row++)
    road(-1000, -100 + row * 40, 1000, -100 + row * 40);
  road(-1000, -100, -1000, 100);
  road(1000, -100, 1000, 100);
  Object.assign(s, roads.snapshot());
  s.nextId = 10000;
  for (let row = 0; row < 6; row++) {
    const z = -100 + row * 40;
    const home = {
      ...structuredClone(districtFixture(1)[0]!),
      id: s.nextId++,
      defId: 'RH',
      kind: 'zoned' as const,
      state: 'active' as const,
      level: 5,
      lotW: 4,
      lotD: 4,
      pos: { x: -760, z: z + 32 },
      residents: 440,
      households: 90,
      frontageSetbackM: 16,
    };
    home.housing = initialHousing(home, buildingCapacity(home));
    s.buildings.push(home);
    for (let n = 0; n < 5; n++)
      s.buildings.push({
        ...structuredClone(districtFixture(1)[0]!),
        id: s.nextId++,
        defId: 'I',
        kind: 'zoned',
        state: 'active',
        level: 1,
        lotW: 4,
        lotD: 4,
        pos: { x: 620 + n * 60, z: z + 32 },
        residents: 0,
        households: 0,
        frontageSetbackM: 16,
      });
  }
  updatePopulation(s);
  const c = s.citizens,
    lanes = new LaneGraph();
  lanes.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, lanes, schedules),
    traffic = new TrafficSystem(s, lanes, planner, schedules);
  const candidates = Array.from({ length: c.count }, (_, i) => i).filter(
    (i) => c.workId[i] && c.age[i]! >= 19 && c.age[i]! <= 64,
  );
  const mainLanes = [...lanes.lanes.values()].filter(
    (l) => Math.abs(l.points[0]!.x - l.points.at(-1)!.x) > 1800,
  );
  let cursor = 0;
  for (const lane of mainLanes) {
    for (
      let n = 0;
      n < 28 && traffic.count < count && cursor < candidates.length;
      n++
    ) {
      const i = candidates[cursor++]!,
        id = c.id[i]!,
        destination = s.buildings.find((b) => b.id === c.workId[i])!;
      const start = lane.length / 2 - 96 + n * 7.1;
      const route = planner.paths.between(
        [{ lane: lane.id, distance: start }],
        planner.paths.access(destination.pos, 'drive', 16),
      );
      if (!route) continue;
      c.tripStatus[i] = JourneyStatus.pending;
      c.tripPurpose[i] = JourneyPurpose.work;
      c.tripOriginId[i] = c.homeId[i]!;
      c.locationId[i] = c.homeId[i]!;
      c.destinationId[i] = destination.id;
      c.travelMode[i] = TravelMode.drive;
      c.tripStartTick[i] = 0;
      c.state[i] = CitizenState.commuting;
      traffic.spawn({
        journey: {
          citizenId: id,
          originId: c.homeId[i]!,
          destinationId: destination.id,
          purpose: JourneyPurpose.work,
          mode: TravelMode.drive,
          requestedTick: 0,
        },
        route,
      });
    }
  }
  // One independent nearby shopping walk, visible at street scale.
  const walker = Array.from({ length: c.count }, (_, i) => i).find(
    (i) => c.tripStatus[i] === JourneyStatus.none,
  )!;
  const route = planner.paths.find(
    { x: -35, z: 120 },
    s.buildings.find((b) => b.id === c.homeId[walker])!.pos,
    'walk',
    0,
    16,
    16,
  );
  if (route) {
    const id = c.id[walker]!;
    c.tripStatus[walker] = JourneyStatus.pending;
    c.tripPurpose[walker] = JourneyPurpose.home;
    c.tripOriginId[walker] = c.homeId[walker]!;
    c.destinationId[walker] = c.homeId[walker]!;
    c.travelMode[walker] = TravelMode.walk;
    c.locationId[walker] = c.homeId[walker]!;
    traffic.spawn({
      journey: {
        citizenId: id,
        originId: c.homeId[walker]!,
        destinationId: c.homeId[walker]!,
        purpose: JourneyPurpose.home,
        mode: TravelMode.walk,
        requestedTick: 0,
      },
      route,
    });
  }
  if (traffic.count < count)
    throw new Error(
      `Only ${traffic.count} traffic agents / ${candidates.length} workers`,
    );
  const snapshot = {
    ...s,
    traffic: traffic.snapshot(),
    clock: { ...s.clock, speed: 0 as const },
  };
  const sim = new Simulation(settings, undefined, snapshot);
  const saved = sim.snapshot();
  return {
    data: Array.from(new Uint8Array(await serialize(saved))),
    settings,
    population: saved.stats.population,
    day: saved.clock.day,
    agents: saved.traffic.vehicles.length,
  };
}
