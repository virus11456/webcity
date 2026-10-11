import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
export function deathcareState() {
  const s = createState({
      seed: 408,
      mapId: 'valley',
      mode: 'sandbox',
      cityName: '殯葬接運測試市',
    }),
    roads = new RoadGraph();
  roads.addRoad({
    start: { x: -400, z: 0 },
    end: { x: 400, z: 0 },
    type: 'road_small',
    builtDay: 0,
    startHeight: 60,
    endHeight: 60,
  });
  Object.assign(s, roads.snapshot());
  s.terrain.heights.fill(60);
  s.nextId = 10010;
  const base = districtFixture(1)[0]!;
  s.buildings = [0, 1].map((i) => ({
    ...structuredClone(base),
    id: 10001 + i,
    kind: i ? ('zoned' as const) : ('service' as const),
    defId: i ? 'RL' : 'cemetery',
    state: 'active' as const,
    pos: { x: i ? 150 : -150, z: 9 },
    rotation: 0,
    lotW: i ? 2 : 4,
    lotD: i ? 2 : 4,
    flags: 7,
    level: 1,
    households: 0,
    residents: 0,
    jobs: 0,
    workers: 0,
  }));
  s.buildings[1]!.bodies = { pending: 3 };
  return { s, roads };
}
