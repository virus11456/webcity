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
