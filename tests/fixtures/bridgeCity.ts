import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import { MAP_SIZE, WORLD } from '../../src/data/config';
import { lerp } from '../../src/core/math';
import type { RoadTypeId } from '../../src/data/roads';
export async function bridgeCity() {
  const settings = {
    seed: 20261006,
    mapId: 'valley',
    mode: 'sandbox' as const,
    cityName: '河上橋樑',
  };
  const initial = new Simulation(settings).snapshot();
  initial.terrain.heights.fill(60);
  for (let z = 0; z < WORLD.heightmapVertices; z++)
    for (let x = 0; x < WORLD.heightmapVertices; x++)
      if (Math.abs(x * WORLD.heightmapSpacingM - MAP_SIZE / 2) < 40)
        initial.terrain.heights[z * WORLD.heightmapVertices + x] = 35;
  const sim = new Simulation(settings, undefined, initial);
  const build = (
    type: RoadTypeId,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    h?: [number, number],
  ) => {
    const start = { x: ax, z: az },
      end = { x: bx, z: bz };
    const r = sim.buildRoad(type, {
      start,
      end,
      c1: lerp(start, end, 1 / 3),
      c2: lerp(start, end, 2 / 3),
      elevated: Boolean(h),
      ...(h ? { startHeight: h[0], endHeight: h[1] } : {}),
    });
    if (!r.ok) throw new Error(r.reason);
  };
  build('road_small', -240, 0, 240, 0);
  build('highway', 140, -220, 140, 220, [78, 78]);
  build('highway_ramp', 460, -220, 140, -220, [60, 78]);
  sim.setSpeed(0);
  const snapshot = sim.snapshot();
  return {
    data: Array.from(new Uint8Array(await serialize(snapshot))),
    settings,
    population: 0,
    day: 0,
  };
}
