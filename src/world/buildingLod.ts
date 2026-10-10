import { BUILDING_LOD as L } from '../data/buildingRendering';
export type BuildingLod = 0 | 1 | 2;
/** Hysteresis stops camera vibration from repeatedly rebuilding the same model. */
export function buildingLod(
  distance: number,
  previous: BuildingLod,
): BuildingLod {
  if (previous === 0 && distance < L.nearM + L.hysteresisM) return 0;
  if (previous === 2 && distance > L.farM - L.hysteresisM) return 2;
  if (distance < L.nearM - (previous === 1 ? L.hysteresisM : 0)) return 0;
  if (distance < L.farM + (previous === 1 ? L.hysteresisM : 0)) return 1;
  return 2;
}

import type { BuildingVolume } from '../data/buildingAppearance';
/** The skyline keeps its full height; distant lots need at most two boxes. */
export function distantMassing(
  volumes: readonly BuildingVolume[],
  high: boolean,
): BuildingVolume[] {
  const union = (items: readonly BuildingVolume[]): BuildingVolume => {
    const minX = Math.min(...items.map((v) => v.x - v.w / 2)),
      maxX = Math.max(...items.map((v) => v.x + v.w / 2));
    const minZ = Math.min(...items.map((v) => v.z - v.d / 2)),
      maxZ = Math.max(...items.map((v) => v.z + v.d / 2));
    const y = Math.min(...items.map((v) => v.y)),
      top = Math.max(...items.map((v) => v.y + v.h));
    return {
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      y,
      w: maxX - minX,
      d: maxZ - minZ,
      h: top - y,
      floors: 1,
    };
  };
  return high && volumes.length > 1
    ? [{ ...volumes[0]! }, union(volumes.slice(1))]
    : [union(volumes)];
}
