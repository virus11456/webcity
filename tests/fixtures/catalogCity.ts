import { GROWTH } from '../../src/data/zones';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { catalogModels } from '../../src/world/modelCatalog';
import { serialize } from '../../src/save/serializer';
/** Visual acceptance save: deliberately authored building inventory, not a progression test. */
export async function catalogCity(group: 'res' | 'cio' = 'res') {
  const s = createState({
    seed: 20261006,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: group === 'res' ? '住宅模型街區' : '商業工業辦公街區',
  });
  s.terrain.heights.fill(60);
  const graph = new RoadGraph();
  for (let row = 0; row < 10; row++)
    graph.addRoad({
      start: { x: -225, z: row * 60 - 240 },
      end: { x: 225, z: row * 60 - 240 },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  Object.assign(s, graph.snapshot());
  const base = districtFixture(1)[0]!;
  const models = catalogModels().filter((m) =>
    group === 'res'
      ? ['RL', 'RH'].includes(m.zone)
      : ['CL', 'CH', 'I', 'O'].includes(m.zone),
  );
  s.buildings = models.map((m, i) => ({
    ...structuredClone(base),
    id: 10001 + i,
    defId: m.zone,
    level: m.level,
    lotW: m.w,
    lotD: m.d,
    seed: m.variant - 1,
    pos: { x: (i % 10) * 42 - 190, z: Math.floor(i / 10) * 60 - 230 },
    rotation: 0,
    state: i >= 84 && i <= 87 ? ('construction' as const) : ('active' as const),
    stateTimer: GROWTH.constructionDays * 0.55,
    households: 0,
    residents: 0,
    jobs: 0,
    workers: 0,
    flags: 0,
  }));
  s.nextId = 11000;
  s.clock.speed = 0;
  const sim = new Simulation(s.settings, undefined, s),
    snapshot = sim.snapshot();
  return {
    data: Array.from(new Uint8Array(await serialize(snapshot))),
    settings: snapshot.settings,
    population: 0,
    day: 0,
  };
}
