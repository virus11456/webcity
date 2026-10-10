import { createState } from '../../src/sim/state';
import { updatePopulation } from '../../src/sim/systems/population';
import { ScheduleSystem } from '../../src/sim/systems/schedules';
import { RoutePlanner } from '../../src/sim/systems/routePlanner';
import { TrafficSystem } from '../../src/sim/systems/traffic';
import { CargoSystem } from '../../src/sim/systems/cargo';
import { RoadGraph } from '../../src/world/roadGraph';
import { LaneGraph } from '../../src/world/laneGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { serialize } from '../../src/save/serializer';
export async function cargoCity() {
  const settings = {
      seed: 20261006,
      mapId: 'valley',
      mode: 'sandbox' as const,
      cityName: '工業送貨到商店',
    },
    s = createState(settings),
    roads = new RoadGraph();
  s.terrain.heights.fill(60);
  roads.addRoad({
    start: { x: -400, z: 0 },
    end: { x: 400, z: 0 },
    type: 'road_small',
    builtDay: 0,
    startHeight: 60,
    endHeight: 60,
  });
  Object.assign(s, roads.snapshot());
  s.nextId = 10003;
  s.buildings = ['I', 'CL'].map((defId, i) => ({
    ...structuredClone(districtFixture(1)[0]!),
    id: 10001 + i,
    kind: 'zoned' as const,
    rotation: 0,
    defId,
    state: 'active' as const,
    level: 1,
    pos: { x: i ? 200 : -240, z: 8 },
    lotW: i ? 2 : 4,
    lotD: i ? 3 : 4,
    flags: 7,
    jobs: 64,
    workers: 0,
    residents: 0,
    households: 0,
  }));
  updatePopulation(s);
  const lanes = new LaneGraph();
  lanes.sync(s.nodes, s.segments);
  const schedules = new ScheduleSystem(s),
    planner = new RoutePlanner(s, lanes, schedules),
    traffic = new TrafficSystem(s, lanes, planner, schedules),
    cargo = new CargoSystem(s, lanes, planner, traffic);
  s.buildings[0]!.cargo!.stock = 120;
  s.buildings[1]!.cargo!.stock = 0;
  s.buildings[1]!.cargo!.shortage = true;
  cargo.tick();
  for (let tick = 0; tick < 5; tick++) {
    s.clock.ticks++;
    s.clock.tickInDay++;
    traffic.step(0.24);
    cargo.tick();
  }
  const truck = traffic.snapshot().vehicles[0]!;
  if (!truck) throw new Error('Missing actual goods truck');
  const snapshot = {
    ...s,
    clock: { ...s.clock, speed: 0 as const },
    traffic: traffic.snapshot(),
  };
  return {
    data: Array.from(new Uint8Array(await serialize(snapshot))),
    settings,
    population: 0,
    day: 0,
    truck: truck.id,
    units: s.cargo.shipments[0]!.units,
    source: 10001,
    target: 10002,
  };
}
