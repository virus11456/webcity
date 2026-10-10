import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { serialize } from '../../src/save/serializer';
export async function serviceCity() {
  const settings = {
      seed: 20261006,
      mapId: 'valley',
      mode: 'sandbox' as const,
      cityName: '道路公共服務',
    },
    s = createState(settings),
    g = new RoadGraph();
  s.terrain.heights.fill(60);
  for (const [a, b] of [
    [
      { x: -300, z: 0 },
      { x: 300, z: 0 },
    ],
    [
      { x: 300, z: 0 },
      { x: 300, z: 300 },
    ],
    [
      { x: 300, z: 300 },
      { x: -300, z: 300 },
    ],
  ] as const)
    g.addRoad({
      start: a,
      end: b,
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  Object.assign(s, g.snapshot());
  s.clock.speed = 0;
  s.nextId = 10003;
  s.buildings = [
    { x: 80, z: 8 },
    { x: -180, z: 308 },
  ].map((pos, i) => ({
    ...structuredClone(districtFixture(1)[0]!),
    id: 10001 + i,
    kind: 'zoned' as const,
    defId: 'RL',
    level: 1,
    state: 'active' as const,
    rotation: 0,
    lotW: 2,
    lotD: 2,
    pos,
    residents: 0,
    households: 0,
    jobs: 0,
    workers: 0,
  }));
  return {
    settings,
    population: 0,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(s))),
  };
}
