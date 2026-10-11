import { createState } from '../../src/sim/state';
import { updatePopulation } from '../../src/sim/systems/population';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { initialHousing } from '../../src/world/population';
import { RoadGraph } from '../../src/world/roadGraph';

/** Authored 100k CPU workload, not a naturally grown or fully serviced city. */
export function performanceCity() {
  const s = createState({
    seed: 20261011,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '100k CPU benchmark',
  });
  s.terrain.heights.fill(60);
  const roads = new RoadGraph();
  for (let row = 0; row < 32; row++)
    roads.addRoad({
      start: { x: -1056, z: row * 64 - 1048 },
      end: { x: 1056, z: row * 64 - 1048 },
      type: 'road_large',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  Object.assign(s, roads.snapshot());
  const base = districtFixture(1)[0]!;
  for (let i = 0; i < 1000; i++) {
    const home = {
      ...structuredClone(base),
      id: 10000 + i,
      defId: 'RH',
      state: 'active' as const,
      level: 5,
      lotW: 4,
      lotD: 4,
      pos: { x: (i % 32) * 64 - 1024, z: Math.floor(i / 32) * 64 - 1024 },
    };
    home.housing = initialHousing(home, 90);
    home.housing.sizes = [0, 0, 0, 0, 20];
    s.buildings.push(home, {
      ...structuredClone(base),
      id: 11000 + i,
      defId: 'I',
      state: 'active',
      level: 1,
      lotW: 4,
      lotD: 4,
      pos: { x: home.pos.x + 32, z: home.pos.z },
    });
  }
  for (let i = 0; i < 32; i++)
    s.buildings.push({
      ...structuredClone(base),
      id: 12000 + i,
      defId: 'CL',
      state: 'active',
      pos: { x: -1056, z: i * 64 - 1024 },
    });
  s.nextId = 13000;
  updatePopulation(s);
  return s;
}
