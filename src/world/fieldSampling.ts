import { MAP_SIZE } from '../data/config';
import type { Vec2 } from './types';
/** Cell-centred environmental rasters cover the entire centred map, including boundary points. */
export function fieldIndex(pos: Vec2, size: number): number {
  const cell = MAP_SIZE / size;
  const x = Math.max(
    0,
    Math.min(size - 1, Math.floor((pos.x + MAP_SIZE / 2) / cell)),
  );
  const z = Math.max(
    0,
    Math.min(size - 1, Math.floor((pos.z + MAP_SIZE / 2) / cell)),
  );
  return z * size + x;
}
