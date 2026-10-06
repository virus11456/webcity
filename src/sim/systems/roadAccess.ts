import { PROBLEMS } from '../../data/simulation';
import { roadAccess } from '../../world/roadAccess';
import type { Building } from '../../world/types';
import type { SimState } from '../state';

/** Flag an immediate loss / restore; building render and citizen systems consume this state later. */
export function refreshRoadAccess(
  s: SimState,
  previouslyConnected?: ReadonlySet<number>,
): Building[] {
  if (!s.buildings.length) return [];
  const connected = roadAccess(s.nodes, s.segments),
    changed: Building[] = [];
  for (const b of s.buildings) {
    if (connected(b)) {
      if (b.roadDisconnectedDay !== undefined) {
        b.roadDisconnectedDay = undefined;
        b.problemTimers.noRoad = 0;
        changed.push(b);
      }
    } else if (
      b.roadDisconnectedDay === undefined &&
      previouslyConnected?.has(b.id)
    ) {
      b.roadDisconnectedDay = s.clock.day;
      b.problemTimers.noRoad = 0;
      changed.push(b);
    }
  }
  return changed;
}
/** Thirty complete disconnected days cause abandonment; repairing the road stops the timer. */
export function tickRoadAccess(s: SimState): Building[] {
  const changed: Building[] = [];
  for (const b of s.buildings) {
    if (
      b.roadDisconnectedDay === undefined ||
      b.state === 'abandoned' ||
      b.state === 'burned'
    )
      continue;
    b.problemTimers.noRoad = s.clock.day - b.roadDisconnectedDay;
    if (b.problemTimers.noRoad >= PROBLEMS.noRoad.days) {
      s.stats.population = Math.max(0, s.stats.population - b.residents);
      b.state = 'abandoned';
      b.stateTimer = 0;
      b.residents = b.workers = b.jobs = b.households = 0;
    }
    changed.push(b);
  }
  return changed;
}
