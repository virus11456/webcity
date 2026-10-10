import { GROWTH } from '../../src/data/zones';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { facilityModels } from '../../src/world/facilityModels';
import { serialize } from '../../src/save/serializer';
/** Visual acceptance save: deliberately authored building inventory, not a progression test. */
export async function facilityCity() {
  const s = createState({
    seed: 20261006,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '公共設施展示城',
  });
  s.terrain.heights.fill(60);
  const graph = new RoadGraph();
  for (let row = 0; row < 5; row++)
    graph.addRoad({
      start: { x: -275, z: row * 90 - 190 },
      end: { x: 275, z: row * 90 - 190 },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  Object.assign(s, graph.snapshot());
  const base = districtFixture(1)[0]!;
  const models = facilityModels.filter((m) => m.definition);
  s.buildings = models.map((m, i) => ({
    ...structuredClone(base),
    id: 10001 + i,
    defId: m.defId,
    kind: m.definition!.kind,
    level: 1,
    lotW: m.w,
    lotD: m.d,
    seed: i,
    pos: { x: (i % 6) * 90 - 225, z: Math.floor(i / 6) * 90 - 180 },
    rotation: 0,
    state: 'active' as const,
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
