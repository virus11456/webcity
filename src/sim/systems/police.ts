import { clamp } from '../../core/math';
import { SERVICE_RULES } from '../../data/simulation';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
/** Daily city unemployment plus each building's exact road-network police coverage. */
export function updateCrime(s: SimState): BuildingPatch[] {
  const p = s.stats.populationDetails,
    unemployment =
      p && p.availableWorkers > 0
        ? clamp(p.unemployed / p.availableWorkers, 0, 1)
        : 0;
  const patches: BuildingPatch[] = [];
  for (const b of s.buildings) {
    if (b.state !== 'active' || (b.crimeUpdatedDay ?? -1) >= s.clock.day)
      continue;
    b.crime = clamp(
      (b.crime ?? 0) +
        SERVICE_RULES.crimeDailyBase +
        unemployment * SERVICE_RULES.crimeUnemploymentFactor -
        (b.coverage?.police ?? 0) * SERVICE_RULES.crimePoliceFactor,
      ...SERVICE_RULES.crimeRange,
    );
    b.crimeUpdatedDay = s.clock.day;
    patches.push({
      id: b.id,
      crime: b.crime,
      crimeUpdatedDay: b.crimeUpdatedDay,
    });
  }
  return patches;
}
