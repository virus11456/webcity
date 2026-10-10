import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import { ROADS, type RoadTypeId } from '../../src/data/roads';
import { lerp } from '../../src/core/math';
/** Actual construction on controlled flat land, serialized with the production codec. */
export async function roadTypesCity() {
  const settings = {
    seed: 20261006,
    mapId: 'valley',
    mode: 'sandbox' as const,
    cityName: '八種道路',
  };
  const initial = new Simulation(settings).snapshot();
  initial.terrain.heights.fill(60);
  const sim = new Simulation(settings, undefined, initial);
  for (const [i, type] of (Object.keys(ROADS) as RoadTypeId[]).entries()) {
    const start = { x: -160, z: -210 + i * 60 },
      end = { x: 160, z: start.z };
    const r = sim.buildRoad(type, {
      start,
      end,
      c1: lerp(start, end, 1 / 3),
      c2: lerp(start, end, 2 / 3),
      elevated: false,
    });
    if (!r.ok) throw new Error(r.reason);
  }
  // Join unequal-width streets with a transverse small road.
  const start = { x: 80, z: -240 },
    end = { x: 80, z: 240 };
  const r = sim.buildRoad('road_small', {
    start,
    end,
    c1: lerp(start, end, 1 / 3),
    c2: lerp(start, end, 2 / 3),
    elevated: false,
  });
  if (!r.ok) throw new Error(r.reason);
  sim.setSpeed(0);
  const snapshot = sim.snapshot();
  return {
    data: Array.from(new Uint8Array(await serialize(snapshot))),
    settings,
    population: 0,
    day: 0,
    snapshot,
  };
}
