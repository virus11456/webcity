import { UTILITY_RULES } from '../../data/buildings';
import { policyValue } from '../../world/policies';
import { HAPPINESS as H } from '../../data/simulation';
import { POWER } from '../../data/power';
import { WATER_UTILITY as W } from '../../data/waterUtility';
import { ZONES, type ZoneType } from '../../data/zones';
import type { Building } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
/** Durable stock determines garbage service once M4 initializes the building. */
export function garbageCollected(b: Building): boolean {
  return b.garbage
    ? b.garbage.stock <= UTILITY_RULES.garbageOverflowUnits
    : b.coverage?.garbage === undefined || b.coverage.garbage > 0;
}
export function buildingHappiness(
  b: Building,
  tax: number,
  policyDelta = 0,
): number {
  const coverage = ['police', 'fire', 'health', 'education'] as const;
  return Math.max(
    H.range[0],
    Math.min(
      H.range[1],
      H.base +
        (b.flags & POWER.flag ? 0 : H.noPower) +
        (b.flags & W.waterFlag ? 0 : H.noWater) +
        (b.flags & W.sewageFlag ? 0 : H.noSewage) +
        (garbageCollected(b) ? 0 : H.noGarbage) +
        coverage.reduce((sum, k) => sum + (b.coverage?.[k] ?? 0), 0) *
          H.serviceBonus +
        (b.parkBonus ?? 0) * H.parkFactor -
        (b.environment?.pollution ?? 0) * H.pollutionPenalty -
        (b.environment?.noise ?? 0) * H.noisePenalty -
        (b.crime ?? 0) * H.crimePenalty -
        (tax - H.neutralTaxPercent) * H.taxPenaltyPerPercentagePoint +
        policyDelta,
    ),
  );
}
export function updateHappiness(s: SimState): BuildingPatch[] {
  const patches: BuildingPatch[] = [],
    homes = new Map<number, number>();
  let total = 0,
    people = 0;
  for (const b of s.buildings) {
    if (b.kind !== 'zoned' || !Object.hasOwn(ZONES, b.defId)) continue;
    const value =
      b.state === 'active'
        ? buildingHappiness(
            b,
            s.taxRates[b.defId as ZoneType] * H.range[1],
            policyValue(s, b.pos, 'happinessDelta', 0),
          )
        : 0;
    if (b.happiness !== value) {
      b.happiness = value;
      patches.push({ id: b.id, happiness: value });
    }
    if (b.residents > 0) {
      total += value * b.residents;
      people += b.residents;
      homes.set(b.id, value);
    }
  }
  s.stats.happiness = people ? total / people : H.base;
  for (let i = 0; i < s.citizens.count; i++)
    s.citizens.happiness[i] = Math.round(
      homes.get(s.citizens.homeId[i]!) ?? H.base,
    );
  return patches;
}
