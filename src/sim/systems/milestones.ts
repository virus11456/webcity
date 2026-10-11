import { MILESTONES } from '../../data/milestones';
import type { SimState } from '../state';
/** Unlock history is durable: a population drop cannot revoke or repay a reward. */
export function updateMilestones(s: SimState): number[] {
  const reached: number[] = [];
  if (s.settings.mode !== 'sandbox')
    for (const m of MILESTONES)
      if (s.stats.population >= m.population && !s.unlocked.includes(m.id)) {
        s.unlocked.push(m.id);
        s.money += m.reward;
        reached.push(m.id);
      }
  s.stats.milestone = Math.max(0, ...s.unlocked);
  s.stats.money = s.money;
  return reached;
}
