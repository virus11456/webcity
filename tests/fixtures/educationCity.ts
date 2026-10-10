import { serviceCity } from './serviceCity';
import { deserialize, serialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
import { initialHousing } from '../../src/world/population';
export async function educationCity() {
  const base = await serviceCity(),
    s = await deserialize(new Uint8Array(base.data).buffer);
  s.settings.cityName = '道路招生與學位';
  for (const b of s.buildings) {
    b.residents = 10;
    b.households = 2;
    b.flags = 7;
    b.housing = initialHousing(b, 90);
  }
  s.buildings.push({
    ...structuredClone(s.buildings[0]!),
    id: s.nextId++,
    kind: 'service',
    defId: 'school_elementary',
    lotW: 5,
    lotD: 5,
    pos: { x: 0, z: 9 },
    residents: 0,
    households: 0,
    housing: undefined,
    enabled: true,
  });
  const sim = new Simulation(s.settings, () => {}, s),
    snapshot = sim.snapshot();
  snapshot.citizens.age.fill(6);
  snapshot.citizens.education.fill(0);
  snapshot.citizens.schoolId.fill(0);
  snapshot.citizens.workId.fill(0);
  snapshot.citizens.requiredEducation.fill(0);
  snapshot.citizens.jobType.fill(0);
  snapshot.citizens.shiftId.fill(0);
  snapshot.citizens.schoolDays.fill(29);
  snapshot.citizens.bornDay.fill(0);
  return {
    ...base,
    settings: s.settings,
    population: snapshot.stats.population,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
  };
}
