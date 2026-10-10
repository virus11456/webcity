import { POWER } from '../data/power';
import { WATER_UTILITY } from '../data/waterUtility';
import { PROBLEM_THRESHOLDS } from '../data/simulation';
import type { Building } from './types';

export const BUILDING_PROBLEMS = [
  'noPower',
  'noWater',
  'noSewage',
  'noRoad',
  'noWorkers',
] as const;
export type BuildingProblem = (typeof BUILDING_PROBLEMS)[number];
export type ProblemIcon = BuildingProblem | 'abandoned';
/** Shared read-only conditions; only occupied zoned buildings consume water. */
export function hasBuildingProblem(
  b: Building,
  problem: BuildingProblem,
): boolean {
  if (b.state !== 'active') return false;
  if (b.kind !== 'zoned') return false;
  switch (problem) {
    case 'noPower':
      return !(b.flags & POWER.flag);
    case 'noWater':
    case 'noSewage': {
      const demand =
        b.defId === 'RL' || b.defId === 'RH'
          ? (b.housing?.occupied ?? b.households)
          : b.jobs;
      return (
        demand > 0 &&
        !(
          b.flags &
          (problem === 'noWater'
            ? WATER_UTILITY.waterFlag
            : WATER_UTILITY.sewageFlag)
        )
      );
    }
    case 'noRoad':
      return b.roadDisconnectedDay !== undefined;
    case 'noWorkers':
      return (
        b.jobs > 0 && b.workers / b.jobs < PROBLEM_THRESHOLDS.workerFillBelow
      );
  }
}
/** One icon per building: terminal state, then earliest abandonment deadline. */
export function buildingProblemIcons(b: Building): ProblemIcon[] {
  if (b.state === 'abandoned' || b.state === 'burned') return ['abandoned'];
  return BUILDING_PROBLEMS.filter((p) => hasBuildingProblem(b, p));
}
