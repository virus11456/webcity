import { PROBLEMS } from '../../data/simulation';
import { TIME } from '../../data/config';
import {
  BUILDING_PROBLEMS,
  hasBuildingProblem,
} from '../../world/buildingProblems';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';

/** Absolute ticks make paused repairs immediate and repeated refreshes idempotent. */
export function updateProblems(s: SimState): BuildingPatch[] {
  const updated: BuildingPatch[] = [];
  for (const b of s.buildings) {
    const before = JSON.stringify([
      b.problemTimers,
      b.problemSinceTick,
      b.state,
      b.stateTimer,
      b.abandonedAtTick,
    ]);
    if (b.state === 'abandoned' || b.state === 'burned') {
      b.abandonedAtTick ??= s.clock.ticks - b.stateTimer * TIME.ticksPerDay;
      b.stateTimer = (s.clock.ticks - b.abandonedAtTick) / TIME.ticksPerDay;
    } else {
      let abandon = false;
      for (const problem of BUILDING_PROBLEMS) {
        if (problem === 'deathcare') continue;
        if (!hasBuildingProblem(b, problem)) {
          b.problemTimers[problem] = 0;
          if (b.problemSinceTick) delete b.problemSinceTick[problem];
          continue;
        }
        b.problemSinceTick ??= {};
        b.problemSinceTick[problem] ??=
          s.clock.ticks - b.problemTimers[problem] * TIME.ticksPerDay;
        const days = Math.max(
          0,
          (s.clock.ticks - b.problemSinceTick[problem]!) / TIME.ticksPerDay,
        );
        b.problemTimers[problem] = days;
        if (
          b.kind === 'zoned' &&
          !b.fire?.burning &&
          days >= PROBLEMS[problem].days
        )
          abandon = true;
      }
      if (abandon) {
        b.state = 'abandoned';
        b.stateTimer = 0;
        b.abandonedAtTick = s.clock.ticks;
      }
    }
    if (
      before !==
      JSON.stringify([
        b.problemTimers,
        b.problemSinceTick,
        b.state,
        b.stateTimer,
        b.abandonedAtTick,
      ])
    )
      updated.push({
        id: b.id,
        state: b.state,
        stateTimer: b.stateTimer,
        problemTimers: { ...b.problemTimers },
        problemSinceTick: { ...b.problemSinceTick },
        abandonedAtTick: b.abandonedAtTick,
      });
  }
  return updated;
}
