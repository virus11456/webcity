import { environmentState } from './environmentCity';
import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
export function levelsState() {
  const s = environmentState();
  s.settings.cityName = '公園住宅升級';
  s.budgets.parks = 1.5;
  s.buildings[2]!.pos.z = 96;
  s.networks.water[0]!.points[1]!.z = 160;
  s.networks.power[0]!.points.push(
    { x: 56, z: 104 },
    { x: 97, z: 104 },
    { x: 97, z: 8 },
  );
  for (const x of [150, 220, 290])
    for (const z of [-80, 80])
      s.buildings.push({
        ...structuredClone(s.buildings[0]!),
        id: s.nextId++,
        defId: 'park_large',
        kind: 'park',
        pos: { x, z: z - 24 },
        rotation: 0,
        lotW: 6,
        lotD: 6,
        households: 0,
        residents: 0,
        housing: undefined,
      });
  s.citizens.education.fill(3);
  s.citizens.age.fill(32);
  s.citizens.bornDay.fill(0);
  s.citizens.requiredEducation.fill(0);
  s.citizens.jobType.fill(0);
  s.citizens.shiftId.fill(0);
  s.buildings[0]!.builtDay = 0;
  const sim = new Simulation(s.settings, undefined, s);
  sim.finance({ t: 'setBudget', dept: 'water', value: 1 });
  return sim.snapshot();
}
export async function levelsCity() {
  const snapshot = levelsState();
  return {
    settings: snapshot.settings,
    population: snapshot.stats.population,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
  };
}
