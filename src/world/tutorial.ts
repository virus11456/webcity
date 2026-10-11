import { CAMERA_LESSONS, TUTORIAL } from '../data/tutorial';
import { POWER } from '../data/power';
import { ROADS } from '../data/roads';
import { UTILITY_RULES } from '../data/buildings';
import { WATER_UTILITY } from '../data/waterUtility';
import { ZONE_CODES } from '../data/zones';
import { shapeDistance } from './power';
import { zoneBuildingFootprint } from './zoneGeometry';
import { zoneCellPolygon } from './zoneGrid';
import type { WorldSnapshot } from './snapshot';
import type { Vec2 } from './types';
export interface TutorialState {
  status: 'active' | 'skipped' | 'completed';
  step: number;
  camera: number;
  dismissed: boolean;
}
export const createTutorial = (enabled = false): TutorialState => ({
  status: enabled ? 'active' : 'skipped',
  step: 0,
  camera: 0,
  dismissed: false,
});
export function validTutorial(v: TutorialState): boolean {
  return (
    !!v &&
    ['active', 'skipped', 'completed'].includes(v.status) &&
    Number.isInteger(v.step) &&
    v.step >= 0 &&
    v.step <= TUTORIAL.steps &&
    Number.isInteger(v.camera) &&
    v.camera >= 0 &&
    v.camera < 1 << CAMERA_LESSONS.length &&
    typeof v.dismissed === 'boolean' &&
    (v.status === 'completed'
      ? v.step === TUTORIAL.steps
      : v.step < TUTORIAL.steps) &&
    (v.step === 0 || v.camera === (1 << CAMERA_LESSONS.length) - 1) &&
    (!v.dismissed || v.status === 'completed')
  );
}
type World = Pick<
  WorldSnapshot,
  'nodes' | 'segments' | 'zoneBlocks' | 'buildings' | 'networks' | 'clock'
>;
/** Count city streets physically connected to the regional highway ramps. */
export function tutorialRoads(w: World): number {
  const reached = new Set<number>(),
    queue: number[] = [];
  for (const s of w.segments)
    if (s.type === 'highway_ramp') {
      reached.add(s.start);
      reached.add(s.end);
      queue.push(s.start, s.end);
    }
  const links = new Map<number, number[]>();
  for (const s of w.segments) {
    links.set(s.start, [...(links.get(s.start) ?? []), s.end]);
    links.set(s.end, [...(links.get(s.end) ?? []), s.start]);
  }
  for (let i = 0; i < queue.length; i++)
    for (const id of links.get(queue[i]!) ?? [])
      if (!reached.has(id)) {
        reached.add(id);
        queue.push(id);
      }
  return w.segments.filter(
    (s) => ROADS[s.type].zoning !== 'none' && reached.has(s.start),
  ).length;
}
/** Physical supply reach can be taught while the residential lots are still empty. */
export function tutorialUtility(w: World, kind: 'power' | 'water'): boolean {
  const source = kind === 'power' ? 'power_wind' : 'water_pump';
  const facilities = w.buildings.filter(
    (b) => b.state === 'active' && b.enabled !== false && !b.fire?.burning,
  );
  const sources = facilities.filter((b) => b.defId === source);
  const pipes = w.networks[kind];
  if (!sources.length || !pipes.length) return false;
  const reach =
    kind === 'power' ? UTILITY_RULES.powerReachM : UTILITY_RULES.waterReachM;
  const join = kind === 'power' ? reach : WATER_UTILITY.pipeJoinM;
  // Water facilities attach to the nearest pipe, not every island within coverage.
  const nearest = (shape: readonly Vec2[]) => {
    let best = Infinity,
      index = -1;
    pipes.forEach((pipe, i) => {
      const distance = shapeDistance(shape, true, pipe.points, false);
      if (
        distance <= reach + POWER.epsilon &&
        (distance < best - POWER.epsilon ||
          (Math.abs(distance - best) <= POWER.epsilon &&
            (index < 0 || pipe.id < pipes[index]!.id)))
      ) {
        best = distance;
        index = i;
      }
    });
    return index;
  };
  const homes: Vec2[][] = [];
  for (const block of w.zoneBlocks)
    block.cells.forEach((code, index) => {
      if (code === ZONE_CODES.RL || code === ZONE_CODES.RH)
        homes.push(zoneCellPolygon(block, index));
    });
  for (const source of sources) {
    const footprint = zoneBuildingFootprint(source),
      seen = new Set<number>(),
      queue: number[] = [];
    const sourcePipe = kind === 'water' ? nearest(footprint) : -1;
    pipes.forEach((p, i) => {
      if (
        kind === 'water'
          ? i === sourcePipe
          : shapeDistance(footprint, true, p.points, false) <= reach
      ) {
        seen.add(i);
        queue.push(i);
      }
    });
    for (let i = 0; i < queue.length; i++)
      pipes.forEach((p, j) => {
        if (
          !seen.has(j) &&
          shapeDistance(pipes[queue[i]!]!.points, false, p.points, false) <=
            join
        ) {
          seen.add(j);
          queue.push(j);
        }
      });
    const connected = queue.map((i) => pipes[i]!);
    const home = homes.some((h) =>
      connected.some((p) => shapeDistance(h, true, p.points, false) <= reach),
    );
    const drain =
      kind === 'power' ||
      facilities.some(
        (b) =>
          b.defId === 'water_drain' &&
          seen.has(nearest(zoneBuildingFootprint(b))),
      );
    if (home && drain) return true;
  }
  return false;
}
/** Only the current lesson is checked: an unrelated action cannot skip camera or finance. */
export function tutorialStepReady(w: World, step: number): boolean {
  switch (step) {
    case 1:
      return tutorialRoads(w) > 0;
    case 2:
      return tutorialRoads(w) >= TUTORIAL.roads;
    case 3: {
      const codes = new Set(w.zoneBlocks.flatMap((b) => Array.from(b.cells)));
      return (
        (codes.has(ZONE_CODES.RL) || codes.has(ZONE_CODES.RH)) &&
        (codes.has(ZONE_CODES.CL) || codes.has(ZONE_CODES.CH)) &&
        codes.has(ZONE_CODES.I)
      );
    }
    case 4:
      return tutorialUtility(w, 'power');
    case 5:
      return tutorialUtility(w, 'water');
    case 6:
      return (
        w.clock.speed > 0 &&
        w.buildings.some((b) => b.kind === 'zoned' && b.state === 'active')
      );
    default:
      return false;
  }
}
