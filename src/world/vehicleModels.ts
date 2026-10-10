import { TrafficKind as K } from '../data/traffic';
/** Stable citizen-based variants survive camera changes and vehicle slot reuse. */
export function vehicleModelIndex(citizenId: number, kind: number): number {
  const seed = Math.imul(citizenId, 2654435761) >>> 0;
  if (kind === K.car) return seed % 6;
  if (kind === K.truck) return 6 + (seed % 3);
  if (kind === K.pedestrian) return 16;
  if (kind === 9) return 15;
  return kind + 7;
}
