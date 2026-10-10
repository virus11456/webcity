import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { serialize } from '../../src/save/serializer';
import { TIME } from '../../src/data/config';
import { GROWTH } from '../../src/data/zones';
export async function effectsCity() {
  const s = createState({
    seed: 20261011,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '特效驗收街區',
  });
  s.terrain.heights.fill(60);
  const graph = new RoadGraph();
  graph.addRoad({
    start: { x: -150, z: 0 },
    end: { x: 150, z: 0 },
    type: 'road_small',
    startHeight: 60,
    endHeight: 60,
    builtDay: 0,
  });
  Object.assign(s, graph.snapshot());
  const base = districtFixture(1)[0]!;
  s.buildings = Array.from({ length: 6 }, (_, i) => ({
    ...structuredClone(base),
    id: 10001 + i,
    defId: i < 3 ? 'I' : 'RH',
    level: 2,
    lotW: 3,
    lotD: 3,
    seed: 1,
    pos: { x: (i % 3) * 65 - 65, z: i < 3 ? 10 : 60 },
    rotation: 0,
    state: 'active' as const,
    stateTimer: 0,
    households: 0,
    residents: 0,
    jobs: 0,
    workers: 0,
    flags: 0,
  }));
  s.buildings[3]!.fire = { burning: true, damage: 0, startedDay: 0 };
  s.buildings[4]!.state = 'construction';
  s.buildings[4]!.stateTimer = GROWTH.constructionDays * 0.5;
  s.buildings[5]!.state = 'construction';
  s.buildings[5]!.stateTimer = GROWTH.constructionDays - 1 / TIME.ticksPerDay;
  s.clock = { ticks: 29, tickInDay: 9, day: 2, speed: 0 };
  s.buildings[5]!.constructionStartedTick = 0;
  s.nextId = 11000;
  const sim = new Simulation(s.settings, undefined, s),
    snapshot = sim.snapshot();
  return {
    data: Array.from(new Uint8Array(await serialize(snapshot))),
    settings: snapshot.settings,
    population: 0,
    day: 2,
  };
}
