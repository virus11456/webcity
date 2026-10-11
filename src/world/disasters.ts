import { DISASTERS as D } from '../data/disasters';
import { BUILDINGS } from '../data/buildings';
import { Rng } from '../core/rng';
import type { Building, Vec2 } from './types';
export interface DisasterState {
  enabled: boolean;
  nextDay: number | null;
  warning: { target: number; pos: Vec2; dueDay: number } | null;
}
export const emptyDisasters = (): DisasterState => ({
  enabled: false,
  nextDay: null,
  warning: null,
});
export function nextDisasterDay(seed: number, day: number) {
  return (
    day +
    D.minIntervalDays +
    Math.floor(
      new Rng(seed ^ D.seedSalt ^ day).next() *
        (D.maxIntervalDays - D.minIntervalDays + 1),
    )
  );
}
export function rebuildCost(b: Building): number {
  const base =
    b.kind === 'zoned'
      ? b.lotW * b.lotD * D.zonedCostPerCell
      : (BUILDINGS.find((d) => d.id === b.defId)?.cost ?? 0);
  return Math.ceil(base * D.rebuildFraction);
}
export function validDisasters(v: DisasterState): boolean {
  if (!v || typeof v.enabled !== 'boolean') return false;
  const day = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
  if (v.nextDay !== null && !day(v.nextDay)) return false;
  if (
    v.warning !== null &&
    (!v.warning ||
      !day(v.warning.target) ||
      v.warning.target <= 0 ||
      !day(v.warning.dueDay) ||
      !v.warning.pos ||
      !Number.isFinite(v.warning.pos.x) ||
      !Number.isFinite(v.warning.pos.z))
  )
    return false;
  return v.enabled
    ? (v.nextDay !== null && v.warning === null) ||
        (v.nextDay === null && v.warning !== null)
    : v.nextDay === null && v.warning === null;
}
