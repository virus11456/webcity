import { BUILDINGS } from '../data/buildings';
import { SEA_LEVEL } from '../data/config';
import { WATER_UTILITY as W } from '../data/waterUtility';
import { closestPointOnSegment } from '../core/math';
import { meshHeightAt } from './heightField';
import { sampleRoad } from './roadProfile';
import {
  finitePoint,
  ownedPoint,
  pathEdges,
  previewFacility,
  previewLine,
  type PowerPreview,
  type PowerWorld,
} from './power';
import type { Vec2 } from './types';
export type WaterWorld = PowerWorld;
export interface WaterPreview extends PowerPreview {
  paths?: Vec2[][];
  intake?: Vec2;
}
type WaterDefinition = Extract<
  (typeof BUILDINGS)[number],
  { readonly water: unknown }
>;
export const waterDefinition = (id: string) =>
  BUILDINGS.find(
    (d): d is WaterDefinition =>
      d.id === id && (W.facilityIds as readonly string[]).includes(id),
  );
/** Intake extends from the front of the dry footprint, opposite its local +Z depth. */
export function intakePoint(pos: Vec2, rotation: number): Vec2 {
  return {
    x: pos.x - Math.sin(rotation) * W.intakeLengthM,
    z: pos.z - Math.cos(rotation) * W.intakeLengthM,
  };
}
export function previewWaterFacility(
  w: WaterWorld,
  id: string,
  pos: Vec2,
  rotation: number,
): WaterPreview {
  const d = waterDefinition(id);
  if (!d)
    return {
      points: [],
      closed: true,
      valid: false,
      reason: 'err.invalidCommand',
      cost: 0,
      output: 0,
    };
  const shore =
    d.placement === 'shore' || d.placement === 'shore-intake-submerged';
  const p: WaterPreview = previewFacility(w, id, pos, rotation, {
    definition: d,
    output: 'water' in d ? d.water.capacityM3PerWeek : 0,
    ...(shore
      ? {
          maxSlope: W.shoreSlope,
          maxHeightDifferenceM: W.shoreHeightDifferenceM,
        }
      : {}),
  });
  if (p.reason === 'err.powerTerrain') p.reason = 'err.waterTerrain';
  if (p.reason === 'err.powerLocked') p.reason = 'err.waterLocked';
  if (shore && finitePoint(pos) && Number.isFinite(rotation)) {
    p.intake = intakePoint(pos, rotation % (Math.PI * 2));
    if (
      p.valid &&
      (!ownedPoint(p.intake, w.ownedTiles) ||
        meshHeightAt(w.heights, p.intake.x, p.intake.z) >
          SEA_LEVEL - W.intakeDepthM)
    ) {
      p.valid = false;
      p.reason = 'err.waterShore';
    }
  }
  return p;
}
export function previewPipe(
  w: WaterWorld,
  points: Vec2[],
  allowShort = false,
): WaterPreview {
  const p = previewLine(w, points, 'water', allowShort);
  if (p.reason === 'err.powerLength') p.reason = 'err.waterLength';
  return p;
}
/** Snap the draft endpoint to existing pipe geometry so mouse/touch can join a buried network. */
export function snapPipe(w: WaterWorld, p: Vec2): Vec2 {
  let result = p,
    best = W.snapM as number;
  for (const n of w.networks)
    for (const [a, b] of pathEdges(n.points, false)) {
      const hit = closestPointOnSegment(p, a, b);
      if (hit.distance < best) {
        best = hit.distance;
        result = { x: a.x + (b.x - a.x) * hit.t, z: a.z + (b.z - a.z) * hit.t };
      }
    }
  return result;
}
/** Preview all missing road-centreline runs; repeat calls charge only genuinely uncovered geometry. */
export function previewRoadPipes(w: WaterWorld): WaterPreview {
  const paths: Vec2[][] = [],
    existing = w.networks.flatMap((n) => pathEdges(n.points, false));
  for (const road of w.segments) {
    if (road.regional) continue;
    const a = w.nodes.find((n) => n.id === road.start),
      b = w.nodes.find((n) => n.id === road.end);
    if (!a || !b) continue;
    const samples = sampleRoad(road, a, b);
    let run: Vec2[] = [];
    const flush = () => {
      if (run.length > 1) paths.push(run);
      run = [];
    };
    for (const [p, q] of pathEdges(samples, false)) {
      if (!ownedPoint(p, w.ownedTiles) || !ownedPoint(q, w.ownedTiles)) {
        flush();
        continue;
      }
      const covered = existing.some(
        ([x, y]) =>
          closestPointOnSegment(p, x, y).distance <= W.pipeJoinM &&
          closestPointOnSegment(q, x, y).distance <= W.pipeJoinM,
      );
      if (covered) flush();
      else {
        if (!run.length) run.push({ x: p.x, z: p.z });
        run.push({ x: q.x, z: q.z });
      }
    }
    flush();
  }
  const result: WaterPreview = {
    points: [],
    paths,
    closed: false,
    valid: false,
    reason: 'err.waterNothing',
    cost: 0,
    output: 0,
  };
  if (!paths.length) return result;
  // Auto runs may be short remnants left by an existing pipe; retain each actual sampled metre.
  for (const points of paths) {
    const p = previewPipe({ ...w, money: Infinity }, points, true);
    if (!p.valid) {
      result.reason = p.reason;
      return result;
    }
    result.cost += p.cost;
  }
  result.valid = result.cost <= w.money;
  result.reason = result.valid ? null : 'err.notEnoughMoney';
  return result;
}
