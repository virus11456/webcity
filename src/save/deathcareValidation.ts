import { DEATHCARE as G } from '../data/deathcare';
import {
  emptyDeathcare,
  deathcareCapacity,
  deathcareDefinition,
  type DeathcareMission,
} from '../world/deathcare';
import type { WorldSnapshot } from '../world/snapshot';
export function validateDeathcare(s: WorldSnapshot) {
  const valid = (v: unknown) => {
    if (!v) throw new Error('Invalid deathcare save data');
  };
  if (!Object.hasOwn(s, 'deathcare')) s.deathcare = emptyDeathcare();
  const g = s.deathcare,
    ids = new Map<number, DeathcareMission>(),
    targets = new Set<number>();
  valid(
    g &&
      g.version === 1 &&
      Array.isArray(g.missions) &&
      g.missions.length <= G.maxMissions &&
      [g.collected, g.processed, g.lost].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      ),
  );
  const buildings = new Map(s.buildings.map((b) => [b.id, b]));
  for (const b of s.buildings) {
    if (b.bodies !== undefined)
      valid(
        b.bodies &&
          Number.isSafeInteger(b.bodies.pending) &&
          b.bodies.pending >= 0,
      );
  }
  for (const b of s.buildings)
    if (b.mortuary !== undefined) {
      const q = b.mortuary;
      valid(
        q &&
          deathcareDefinition(b.defId) &&
          [q.stock, q.processedToday].every(
            (n) => Number.isSafeInteger(n) && n >= 0,
          ) &&
          q.stock <= deathcareCapacity(b) &&
          Number.isSafeInteger(q.lastDay) &&
          q.lastDay >= -1 &&
          q.lastDay <= s.clock.day &&
          typeof q.full === 'boolean' &&
          Number.isSafeInteger(q.vehicles) &&
          q.vehicles >= 0,
      );
    }
  for (const m of g.missions) {
    const from = buildings.get(m.from),
      to = buildings.get(m.to);
    valid(
      Number.isSafeInteger(m.id) &&
        m.id > 0 &&
        !ids.has(m.id) &&
        Number.isSafeInteger(m.from) &&
        Number.isSafeInteger(m.to) &&
        m.from !== m.to &&
        from?.mortuary &&
        from.state === 'active' &&
        ['collect', 'return'].includes(m.phase) &&
        (m.phase === 'return' || (to?.bodies && !targets.has(m.to))) &&
        Number.isSafeInteger(m.units) &&
        m.units >= 0 &&
        m.units <= G.truckCapacity &&
        (m.phase !== 'collect' || m.units > 0) &&
        m.pickup &&
        Number.isFinite(m.pickup.x) &&
        Number.isFinite(m.pickup.z) &&
        Number.isFinite(m.setback) &&
        m.setback >= 0 &&
        Number.isSafeInteger(m.requestedTick) &&
        m.requestedTick >= 0 &&
        m.requestedTick <= s.clock.ticks &&
        Number.isSafeInteger(m.retryTick) &&
        m.retryTick >= 0,
    );
    ids.set(m.id, m);
    if (m.phase === 'collect') targets.add(m.to);
  }
  for (const b of s.buildings)
    if (b.mortuary)
      valid(
        b.mortuary.stock +
          g.missions
            .filter((m) => m.from === b.id)
            .reduce((n, m) => n + m.units, 0) <=
          deathcareCapacity(b) + Number.EPSILON * deathcareCapacity(b),
      );
  return ids;
}
