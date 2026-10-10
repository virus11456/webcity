import { serviceCity } from './serviceCity';
import { deserialize, serialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
import { initialHousing } from '../../src/world/population';
export async function healthCity() {
  const base = await serviceCity(),
    s = await deserialize(new Uint8Array(base.data).buffer);
  s.settings.cityName = '居民健康與醫療';
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
    defId: 'clinic',
    lotW: 3,
    lotD: 3,
    pos: { x: 0, z: 9 },
    residents: 0,
    households: 0,
    housing: undefined,
    enabled: true,
  });
  const sim = new Simulation(s.settings, () => {}, s),
    snapshot = sim.snapshot();
  snapshot.citizens.health.fill(39);
  snapshot.citizens.healthFraction.fill(0);
  snapshot.citizens.age.fill(32);
  snapshot.citizens.bornDay.fill(0);
  snapshot.citizens.lastHealthDay = 0;
  snapshot.fields.pollution.fill(50);
  return {
    ...base,
    settings: s.settings,
    population: snapshot.stats.population,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
  };
}
