/** Manual archive recipe: run against the recorded source commit, never during tests. */
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createState } from '../src/sim/state';
import { Simulation } from '../src/sim/simulation';
import { RoadGraph } from '../src/world/roadGraph';
import { districtFixture } from '../src/render/buildings/districtFixture';
import { initialHousing, buildingCapacity } from '../src/world/population';
import { serialize } from '../src/save/serializer';

const output = process.argv[2];
if (!output) throw new Error('Provide a new .wcity output path');
const s = createState({
  seed: 72,
  mapId: 'valley',
  mode: 'normal',
  cityName: '歷史存檔回歸城',
});
// Artificial flat terrain keeps the frozen binary compact and independent of terrain noise.
s.terrain.heights.fill(60);
s.terrain.river.fill(-2000);
for (const resource of Object.values(s.terrain.resources)) resource.fill(0);
const roads = new RoadGraph();
roads.addRoad({
  start: { x: -240, z: -80 },
  end: { x: -80, z: -80 },
  type: 'road_small',
  startHeight: 60,
  endHeight: 60,
  builtDay: 0,
});
Object.assign(s, roads.snapshot());
const home = {
  ...districtFixture(1)[0]!,
  id: 10001,
  defId: 'RL',
  level: 1,
  lotW: 2,
  lotD: 2,
  pos: { x: -160, z: -88 },
  rotation: Math.PI,
  residents: 6,
  households: 2,
};
home.housing = initialHousing(home, buildingCapacity(home));
s.buildings = [home];
s.nextId = 10002;
s.clock.speed = 0;
const sim = new Simulation(s.settings, undefined, s);
sim.finance({ t: 'takeLoan', bank: 0 });
sim.finance({ t: 'setTax', zone: 'RL', rate: 0.15 });
const snapshot = sim.snapshot();
const bytes = new Uint8Array(await serialize(snapshot));
await writeFile(output, bytes, { flag: 'wx' });
console.log(
  JSON.stringify(
    {
      file: output,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      population: snapshot.stats.population,
      money: snapshot.money,
      clock: snapshot.clock,
      loans: snapshot.loans,
      nextId: snapshot.nextId,
      buildings: snapshot.buildings.map((b) => ({
        id: b.id,
        residents: b.residents,
      })),
    },
    null,
    2,
  ),
);
