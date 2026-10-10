import { serviceCity } from './serviceCity';
import { deserialize, serialize } from '../../src/save/serializer';
export async function policeCity() {
  const base = await serviceCity(),
    s = await deserialize(new Uint8Array(base.data).buffer);
  s.settings.cityName = '警察與犯罪';
  for (const b of s.buildings) {
    b.crime = 80;
    b.crimeUpdatedDay = 0;
    b.flags = 7;
  }
  s.buildings.push({
    ...structuredClone(s.buildings[0]!),
    id: s.nextId++,
    kind: 'service',
    defId: 'police_station',
    lotW: 4,
    lotD: 4,
    pos: { x: -100, z: 9 },
    crime: 0,
    enabled: false,
  });
  return {
    ...base,
    settings: s.settings,
    data: Array.from(new Uint8Array(await serialize(s))),
  };
}
