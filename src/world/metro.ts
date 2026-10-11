import { METRO as M } from '../data/metro';
import { NETWORKS } from '../data/buildings';
import { MAP_SIZE, MAP_TILES, TILE_SIZE } from '../data/config';
import type { Vec2 } from './types';
import type { Route } from './routes';
/** Dedicated loop tracks; no connection to the road lane graph. */
export function metroRoute(
  a: Vec2,
  b: Vec2,
  height: (x: number, z: number) => number,
  revision: number,
  id: string,
): Route {
  const length = Math.hypot(b.x - a.x, b.z - a.z),
    count = Math.ceil(length / M.sampleM);
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const x = a.x + ((b.x - a.x) * i) / count,
      z = a.z + ((b.z - a.z) * i) / count;
    return { x, y: height(x, z) - M.depthM, z, distance: (length * i) / count };
  });
  return {
    revision,
    mode: 'drive',
    length,
    costSeconds: length / M.speedMps,
    legs: [
      {
        id,
        kind: 'access',
        segment: 0,
        lane: id,
        length,
        speedMps: M.speedMps,
        points,
      },
    ],
  };
}
export function metroTrackCost(stops: readonly Vec2[]): number {
  const unit = NETWORKS.find((n) => n.id === 'metro_track')!.costPer8M;
  return stops.reduce(
    (sum, p, i) =>
      sum +
      Math.ceil(
        Math.hypot(
          p.x - stops[(i + 1) % stops.length]!.x,
          p.z - stops[(i + 1) % stops.length]!.z,
        ) / M.sampleM,
      ) *
        unit,
    0,
  );
}
export function metroLandValid(
  stops: readonly Vec2[],
  owned: readonly number[],
): boolean {
  return stops.every((a, i) => {
    const b = stops[(i + 1) % stops.length]!,
      d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < M.minLegM || d > M.maxLegM) return false;
    const n = Math.ceil(d / M.sampleM);
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n,
        z = a.z + ((b.z - a.z) * k) / n;
      const tx = Math.floor((x + MAP_SIZE / 2) / TILE_SIZE),
        tz = Math.floor((z + MAP_SIZE / 2) / TILE_SIZE);
      if (
        tx < 0 ||
        tz < 0 ||
        tx >= MAP_TILES ||
        tz >= MAP_TILES ||
        !owned.includes(tz * MAP_TILES + tx)
      )
        return false;
    }
    return true;
  });
}
