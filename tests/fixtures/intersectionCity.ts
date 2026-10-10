import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import { lerp } from '../../src/core/math';
export async function intersectionCity() {
  const settings = {
    seed: 20261006,
    mapId: 'valley',
    mode: 'sandbox' as const,
    cityName: '路口號誌',
  };
  const initial = new Simulation(settings).snapshot();
  initial.terrain.heights.fill(60);
  const sim = new Simulation(settings, undefined, initial);
  for (const [ax, az, bx, bz] of [
    [-200, 0, 200, 0],
    [0, -200, 0, 200],
  ]) {
    const start = { x: ax!, z: az! },
      end = { x: bx!, z: bz! };
    const r = sim.buildRoad('road_medium', {
      start,
      end,
      c1: lerp(start, end, 1 / 3),
      c2: lerp(start, end, 2 / 3),
      elevated: false,
    });
    if (!r.ok) throw new Error(r.reason);
  }
  sim.setSpeed(0);
  return {
    data: Array.from(new Uint8Array(await serialize(sim.snapshot()))),
    settings,
    population: 0,
    day: 0,
  };
}
