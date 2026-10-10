import { GAME_MODES, type GameMode } from '../data/config';
import { ROAD_GRAPH_PRECISION } from '../data/roadGraph';
import { ROADS, type RoadTypeId } from '../data/roads';
import { distance, lerp } from '../core/math';
import {
  previewStraightRoad,
  type RoadBuildReason,
  type RoadGeometryWorld,
  type RoadPreviewResult,
} from './roadGeometry';
import type { RoadDraft } from './snapshot';
import type { Vec2 } from './types';

export type ConstructionReason =
  RoadBuildReason | 'err.notEnoughMoney' | 'err.roadLocked';
export interface RoadConstructionWorld extends RoadGeometryWorld {
  money: number;
  mode: GameMode;
  unlocked: readonly number[];
}
export interface ConstructionPreview extends Omit<RoadPreviewResult, 'reason'> {
  reason: ConstructionReason | null;
}
/** Add financial and unlock rules to the shared geometry result without changing state. */
export function checkRoadBudget(
  result: RoadPreviewResult,
  type: RoadTypeId,
  world: RoadConstructionWorld,
): ConstructionPreview {
  if (
    !GAME_MODES[world.mode].allUnlocked &&
    !world.unlocked.includes(ROADS[type].unlock)
  )
    return { ...result, canBuild: false, reason: 'err.roadLocked' };
  if (
    result.canBuild &&
    result.preview &&
    !GAME_MODES[world.mode].unlimitedMoney &&
    result.preview.cost > world.money
  )
    return { ...result, canBuild: false, reason: 'err.notEnoughMoney' };
  return result;
}
/** Recheck an already positioned cubic draft, retaining exact connections without resnapping its geometry. */
export function validateRoadDraft(
  type: RoadTypeId,
  points: RoadDraft,
  world: RoadConstructionWorld,
): ConstructionPreview {
  return checkRoadBudget(
    previewStraightRoad(
      {
        type,
        start: points.start,
        end: points.end,
        c1: points.c1,
        c2: points.c2,
        snap: { angle: false, length: false, connections: 'exact' },
      },
      world,
    ),
    type,
    world,
  );
}
const point = (value: unknown): value is Vec2 =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'x' in value &&
    'z' in value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z),
  );
/** Worker payload guard: only finite, straight, ground drafts are supported by this tool. */
export function isStraightRoadDraft(value: unknown): value is RoadDraft {
  if (
    !value ||
    typeof value !== 'object' ||
    !('start' in value) ||
    !('end' in value) ||
    !('c1' in value) ||
    !('c2' in value) ||
    !('elevated' in value)
  )
    return false;
  if (
    !point(value.start) ||
    !point(value.end) ||
    !point(value.c1) ||
    !point(value.c2) ||
    value.elevated !== false
  )
    return false;
  return (
    distance(value.c1, lerp(value.start, value.end, 1 / 3)) <=
      ROAD_GRAPH_PRECISION.positionM &&
    distance(value.c2, lerp(value.start, value.end, 2 / 3)) <=
      ROAD_GRAPH_PRECISION.positionM
  );
}

/** All finite ground-road cubic payloads; detailed geometry is revalidated by Worker. */
export function isRoadDraft(value: unknown): value is RoadDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    point(v.start) &&
    point(v.end) &&
    point(v.c1) &&
    point(v.c2) &&
    v.elevated === false
  );
}
