import { Rng } from '../../core/rng';
import { DISASTERS as D } from '../../data/disasters';
import { nextDisasterDay } from '../../world/disasters';
import type { SimState } from '../state';
import type { SimEvent } from '../../bridge/protocol';
/** Daily authoritative forecast and ignition; FireSystem handles damage and real rescue. */
export function updateDisasters(
  s: SimState,
  emit: (event: SimEvent) => void,
): number[] {
  const d = s.disasters;
  if (!d?.enabled) return [];
  const eligible = s.buildings
    .filter(
      (b) => b.state === 'active' && b.defId !== 'tree' && !b.fire?.burning,
    )
    .sort((a, b) => a.id - b.id);
  const ids: number[] = [];
  if (d.warning && s.clock.day >= d.warning.dueDay) {
    const center = eligible.find((b) => b.id === d.warning!.target);
    if (center) {
      const nearby = eligible
        .filter(
          (b) =>
            Math.hypot(b.pos.x - center.pos.x, b.pos.z - center.pos.z) <=
            D.radiusM,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.pos.x - center.pos.x, a.pos.z - center.pos.z) -
              Math.hypot(b.pos.x - center.pos.x, b.pos.z - center.pos.z) ||
            a.id - b.id,
        )
        .slice(0, D.maxBuildings);
      for (const b of nearby) {
        b.fire = { burning: true, damage: 0, startedDay: s.clock.day };
        ids.push(b.id);
      }
      emit({
        t: 'notify',
        kind: 'danger',
        pos: { ...center.pos },
        params: { code: 'disasterFire' },
      });
    }
    d.warning = null;
    d.nextDay = nextDisasterDay(s.seed, s.clock.day);
  } else if (d.nextDay !== null && s.clock.day >= d.nextDay) {
    const rng = new Rng(s.seed ^ D.seedSalt ^ s.clock.day);
    const target = eligible[Math.floor(rng.next() * eligible.length)];
    if (target) {
      d.warning = {
        target: target.id,
        pos: { ...target.pos },
        dueDay: s.clock.day + D.warningDays,
      };
      d.nextDay = null;
      emit({
        t: 'notify',
        kind: 'warning',
        pos: { ...target.pos },
        params: { code: 'disasterWarning' },
      });
    } else d.nextDay = nextDisasterDay(s.seed, s.clock.day);
  } else return [];
  emit({ t: 'disasters', state: structuredClone(d) });
  return ids;
}
