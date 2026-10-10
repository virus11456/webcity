import { clamp } from '../../core/math';
import { HEALTH as H } from '../../data/health';
import { CITIZENS } from '../../data/simulation';
import { fieldIndex } from '../../world/fieldSampling';
import type { BuildingPatch } from '../../world/snapshot';
import type { HealthSummary } from '../../world/types';
import type { SimState } from '../state';
/** Only daily calls change citizens; structural refreshes rebuild summaries without healing. */
export function updateHealth(s: SimState, daily = false): BuildingPatch[] {
  const c = s.citizens,
    advance = daily && c.lastHealthDay < s.clock.day;
  const homes = new Map(
    s.buildings
      .filter(
        (b) => b.state === 'active' && (b.defId === 'RL' || b.defId === 'RH'),
      )
      .map((b) => [b.id, b]),
  );
  const changes = new Map<number, number>(),
    totals = new Map<number, HealthSummary>();
  for (const b of homes.values()) {
    changes.set(
      b.id,
      (b.coverage?.health ?? 0) * H.recoveryPerCoverageDay -
        clamp(
          s.fields.pollution[fieldIndex(b.pos, s.fields.size)]!,
          0,
          H.maxExposure,
        ) *
          H.pollutionLossPerPointDay -
        clamp(b.drinkingWaterPollution ?? 0, 0, H.maxExposure) *
          H.waterLossPerPointDay,
    );
    totals.set(b.id, { average: 0, sick: 0, residents: 0 });
  }
  let sum = 0,
    sick = 0,
    count = 0;
  for (let i = 0; i < c.count; i++) {
    const home = c.homeId[i]!,
      summary = totals.get(home);
    if (!summary) continue;
    if (advance) {
      const value = Math.round(
        clamp(
          c.health[i]! +
            c.healthFraction[i]! / H.precision +
            changes.get(home)!,
          ...CITIZENS.healthRange,
        ) * H.precision,
      );
      c.health[i] = Math.floor(value / H.precision);
      c.healthFraction[i] = value % H.precision;
    }
    const value = c.health[i]! + c.healthFraction[i]! / H.precision;
    summary.average += value;
    summary.residents++;
    sum += value;
    count++;
    if (value < H.sickBelow) {
      summary.sick++;
      sick++;
    }
  }
  if (advance) c.lastHealthDay = s.clock.day;
  s.stats.health = {
    average: count ? sum / count : CITIZENS.healthRange[1],
    sick,
    residents: count,
  };
  const patches: BuildingPatch[] = [];
  for (const b of s.buildings) {
    const h = totals.get(b.id);
    if (h)
      h.average = h.residents
        ? h.average / h.residents
        : CITIZENS.healthRange[1];
    else if (!b.health) continue;
    const next = h ?? {
      average: CITIZENS.healthRange[1],
      sick: 0,
      residents: 0,
    };
    if (
      b.health?.average === next.average &&
      b.health.sick === next.sick &&
      b.health.residents === next.residents
    )
      continue;
    b.health = next;
    patches.push({ id: b.id, health: { ...next } });
  }
  return patches;
}
