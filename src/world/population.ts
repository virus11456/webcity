import { DEMAND, POPULATION_PROFILE } from '../data/simulation';
import {
  GROWTH,
  JOB_EDUCATION_PERCENT,
  ZONES,
  type ZoneType,
} from '../data/zones';
import type { Building, EducationCounts, HousingPopulation } from './types';
export const emptyEducation = (): EducationCounts => [0, 0, 0, 0];
/** Largest remainders, stable index ties; always allocates exactly total integer places. */
export function distribute(
  total: number,
  weights: readonly number[],
): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum),
    result = exact.map(Math.floor);
  const order = exact
    .map((v, i) => ({ i, remainder: v - result[i]! }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let n = total - result.reduce((a, b) => a + b, 0), i = 0; i < n; i++)
    result[order[i]!.i]!++;
  return result;
}
export function buildingCapacity(b: Building): number {
  if (
    b.kind !== 'zoned' ||
    b.state !== 'active' ||
    !Object.hasOwn(ZONES, b.defId)
  )
    return 0;
  const values = ZONES[b.defId as ZoneType].capacityPerCell;
  const perCell =
    values[Math.max(0, Math.min(values.length - 1, Math.floor(b.level) - 1))]!;
  return Math.max(GROWTH.minCapacity, Math.round(b.lotW * b.lotD * perCell));
}
export function residential(b: Building): boolean {
  return b.kind === 'zoned' && (b.defId === 'RL' || b.defId === 'RH');
}
export function jobPlaces(b: Building): EducationCounts {
  if (
    b.kind !== 'zoned' ||
    !Object.hasOwn(JOB_EDUCATION_PERCENT, b.defId) ||
    b.state !== 'active'
  )
    return emptyEducation();
  const profiles =
    JOB_EDUCATION_PERCENT[b.defId as keyof typeof JOB_EDUCATION_PERCENT];
  return distribute(
    buildingCapacity(b),
    profiles[Math.max(0, Math.min(profiles.length - 1, b.level - 1))]!,
  ) as EducationCounts;
}
/** Aggregate household size counts, not citizens or a collection of household agents. */
export function initialHousing(
  b: Building,
  capacity: number,
): HousingPopulation {
  const sizes: HousingPopulation['sizes'] = [0, 0, 0, 0, 0];
  const residents = Math.min(
    b.residents,
    capacity * GROWTH.householdSizeRange[1],
  );
  const occupied = Math.min(
    capacity,
    residents,
    Math.max(Math.ceil(residents / GROWTH.householdSizeRange[1]), b.households),
  );
  if (occupied > 0) {
    const size = Math.floor(residents / occupied),
      larger = residents % occupied;
    sizes[size - 1] = occupied - larger;
    if (larger) sizes[size] = larger;
  }
  return {
    sizes,
    occupied: 0,
    education: emptyEducation(),
    ages: emptyEducation(),
    averageEducation: 0,
    availableWorkers: emptyEducation(),
    employed: 0,
    assignments: [],
  };
}
export function summarizeHousing(h: HousingPopulation): number {
  h.occupied = h.sizes.reduce((a, b) => a + b, 0);
  const residents = h.sizes.reduce((sum, count, i) => sum + count * (i + 1), 0);
  h.education = distribute(
    residents,
    POPULATION_PROFILE.educationPercent,
  ) as EducationCounts;
  h.ages = distribute(
    residents,
    POPULATION_PROFILE.agePercent,
  ) as EducationCounts;
  h.averageEducation = residents
    ? h.education.reduce((sum, n, i) => sum + n * i, 0) / residents
    : 0;
  h.availableWorkers = distribute(
    Math.floor(residents * DEMAND.estimatedWorkerFraction),
    h.education,
  ) as EducationCounts;
  h.employed = 0;
  h.assignments = [];
  return residents;
}
