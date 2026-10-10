import { updatePower } from '../../src/sim/systems/power';
import { updateWater } from '../../src/sim/systems/water';
import { summarizeHousing } from '../../src/world/population';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { MAP_PRESETS } from '../../src/data/terrain';
import { initialHousing, buildingCapacity } from '../../src/world/population';
import { serialize } from '../../src/save/serializer';
/** Inhabited, unserved home: utility tests must not wait several real-time construction days. */
export async function utilityCity() {
  const map = MAP_PRESETS[0],
    s = createState({
      seed: map.seed,
      mapId: map.id,
      mode: 'normal',
      cityName: '水電建造回歸',
    }),
    roads = new RoadGraph();
  roads.addRoad({
    start: { x: -240, z: -80 },
    end: { x: -80, z: -80 },
    type: 'road_small',
    startHeight: 58,
    endHeight: 58,
    builtDay: 0,
  });
  Object.assign(s, roads.snapshot());
  const home = {
    ...structuredClone(districtFixture(1)[0]!),
    id: 10001,
    kind: 'zoned' as const,
    defId: 'RL',
    level: 1,
    lotW: 2,
    lotD: 2,
    pos: { x: -160, z: -88 },
    rotation: Math.PI,
    state: 'active' as const,
    households: 2,
    residents: 6,
    jobs: 0,
    workers: 0,
    flags: 0,
  };
  home.housing = initialHousing(home, buildingCapacity(home));
  s.buildings = [home];
  s.nextId = 10002;
  s.clock.speed = 0;
  summarizeHousing(home.housing);
  updatePower(s);
  updateWater(s);
  const snapshot = new Simulation(s.settings, undefined, s).snapshot();
  return {
    settings: s.settings,
    population: snapshot.stats.population,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
  };
}
