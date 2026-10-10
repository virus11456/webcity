import { serviceCity } from './serviceCity';
import { deserialize, serialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
export async function fireCity() {
  const base = await serviceCity(),
    s = await deserialize(new Uint8Array(base.data).buffer);
  s.settings.cityName = '消防救援';
  for (const b of s.buildings) {
    b.flags = 7;
    b.fire = { burning: true, damage: 0, startedDay: 0 };
  }
  s.buildings.push({
    ...structuredClone(s.buildings[0]!),
    id: s.nextId++,
    kind: 'service',
    defId: 'fire_station',
    lotW: 4,
    lotD: 4,
    pos: { x: 0, z: 9 },
    fire: undefined,
    enabled: true,
  });
  s.clock.speed = 1;
  const sim = new Simulation(s.settings, () => {}, s);
  sim.advance(240);
  sim.setSpeed(0);
  return {
    ...base,
    settings: s.settings,
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
  };
}
