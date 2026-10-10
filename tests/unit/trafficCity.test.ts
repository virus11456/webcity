import { expect, it } from 'vitest';
import { trafficCity } from '../fixtures/trafficCity';
import { deserialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
it('loads a 1000 vehicle benchmark with individual real citizen journeys', async () => {
  const f = await trafficCity(),
    s = await deserialize(new Uint8Array(f.data).buffer);
  expect(s.traffic.vehicles.length).toBeGreaterThanOrEqual(1000);
  const sim = new Simulation(s.settings, undefined, s);
  expect(sim.traffic.count).toBe(s.traffic.vehicles.length);
  const ids = new Set(s.traffic.vehicles.map((v) => v.journey.citizenId));
  expect(ids.size).toBe(sim.traffic.count);
});
