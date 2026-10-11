import { POLICIES, type PolicyId } from '../../data/policies';
import { GAME_MODES } from '../../data/config';
import { garbageRate } from '../../world/policies';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';
import type { Result } from '../../bridge/protocol';
export function setPolicy(
  s: SimState,
  policy: PolicyId,
  district: number | null,
  on: boolean | null,
): Omit<Result, 't' | 'reqId'> {
  const def = POLICIES.find((p) => p.id === policy);
  if (!def) return { ok: false, reason: 'err.invalidCommand' };
  if (
    !GAME_MODES[s.settings.mode].allUnlocked &&
    !s.unlocked.includes(def.unlock)
  )
    return { ok: false, reason: 'err.locked' };
  if (district === null && on === null)
    return { ok: false, reason: 'err.invalidCommand' };
  if (district === null)
    s.policies = on
      ? [...new Set([...s.policies, policy])]
      : s.policies.filter((p) => p !== policy);
  else {
    if (!s.districts.some((d) => d.id === district))
      return { ok: false, reason: 'err.invalidCommand' };
    s.districts = s.districts.map((d) =>
      d.id === district
        ? {
            ...d,
            policies: Object.fromEntries(
              Object.entries({ ...d.policies, [policy]: on }).filter(
                ([, v]) => v !== null,
              ),
            ),
          }
        : d,
    );
  }
  return { ok: true };
}
/** Production is durable and idempotent; collection is supplied by M4-07. */
export function updateGarbageProduction(
  s: SimState,
  daily = false,
): BuildingPatch[] {
  const patches: BuildingPatch[] = [];
  for (const b of s.buildings) {
    const rate = garbageRate(s, b);
    if (!rate && !b.garbage) continue;
    const g = b.garbage ?? {
      stock: 0,
      lastDay: s.clock.day - 1,
      generated: rate,
    };
    const next = { ...g, generated: rate };
    if (daily && g.lastDay < s.clock.day) {
      next.stock += rate;
      next.lastDay = s.clock.day;
    }
    if (JSON.stringify(b.garbage) !== JSON.stringify(next)) {
      b.garbage = next;
      patches.push({ id: b.id, garbage: { ...next } });
    }
  }
  return patches;
}
