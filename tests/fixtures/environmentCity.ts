import { updatePopulation } from '../../src/sim/systems/population';
import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { initialHousing } from '../../src/world/population';
import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import { WORLD, MAP_SIZE } from '../../src/data/config';
export function environmentState() {
  const s = createState({
    seed: 20261010,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '上游排污與飲用水',
  });
  s.terrain.heights.fill(60);
  s.terrain.river.fill(0);
  for (let z = 0; z < WORLD.heightmapVertices; z++)
    for (let x = 0; x < WORLD.heightmapVertices; x++)
      if (Math.abs(x * 16 - MAP_SIZE / 2) <= 16)
        s.terrain.heights[z * WORLD.heightmapVertices + x] = 32;
  const g = new RoadGraph();
  g.addRoad({
    start: { x: 80, z: -200 },
    end: { x: 80, z: 200 },
    type: 'road_small',
    startHeight: 60,
    endHeight: 60,
    builtDay: 0,
  });
  Object.assign(s, g.snapshot());
  const base = {
    ...structuredClone(districtFixture(1)[0]!),
    state: 'active' as const,
    level: 1,
    flags: 0,
    households: 0,
    residents: 0,
    jobs: 0,
    workers: 0,
    lotW: 2,
    lotD: 2,
    rotation: Math.PI / 2,
  };
  const home = {
    ...base,
    id: 10001,
    kind: 'zoned' as const,
    defId: 'RL',
    pos: { x: 89, z: 0 },
    households: 2,
    residents: 10,
  };
  home.housing = initialHousing(home, 2);
  s.buildings = [
    home,
    {
      ...base,
      id: 10002,
      kind: 'utility',
      defId: 'water_pump',
      pos: { x: 48, z: 0 },
    },
    {
      ...base,
      id: 10003,
      kind: 'utility',
      defId: 'water_drain',
      pos: { x: 48, z: -64 },
    },
    {
      ...base,
      id: 10004,
      kind: 'utility',
      defId: 'power_wind',
      rotation: 0,
      pos: { x: 128, z: -100 },
    },
  ];
  s.networks.water = [
    {
      id: 11001,
      points: [
        { x: 56, z: -128 },
        { x: 56, z: 80 },
      ],
    },
  ];
  s.networks.power = [
    {
      id: 11002,
      points: [
        { x: 136, z: -92 },
        { x: 56, z: -92 },
        { x: 56, z: 80 },
      ],
    },
  ];
  s.nextId = 12000;
  s.clock.speed = 0;
  updatePopulation(s);
  return s;
}
export async function environmentCity() {
  const state = environmentState(),
    sim = new Simulation(state.settings, undefined, state);
  sim.finance({ t: 'setBudget', dept: 'water', value: 1 });
  const snapshot = sim.snapshot();
  snapshot.citizens.age.fill(32);
  snapshot.citizens.bornDay.fill(0);
  return {
    settings: state.settings,
    population: snapshot.stats.population,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
  };
}
