import { TERRAFORM as T } from '../data/terraform';
import { MAP_SIZE, SEA_LEVEL, WORLD } from '../data/config';
import { ROADS } from '../data/roads';
import { clamp, closestPointOnSegment } from '../core/math';
import { finitePoint, ownedPoint } from './power';
import { meshHeightAt } from './heightField';
import { polygonBounds, zoneBuildingFootprint } from './zoneGeometry';
import { sampleRoad } from './roadProfile';
import type { RoadConstructionWorld } from './roadConstruction';
import type { TerrainPatch } from './roadBed';
import type { Vec2 } from './types';
export interface TerraformDraft {
  mode: (typeof T.modes)[number];
  radius: (typeof T.radii)[number];
  points: Vec2[];
}
export type TerraformReason =
  | 'err.invalidCommand'
  | 'err.terraformSandbox'
  | 'err.terraformProtected'
  | 'err.terraformEmpty'
  | 'err.landNotOwned';
export interface TerraformPreview {
  patch: TerrainPatch;
  reason: TerraformReason | null;
}
export function isTerraformDraft(value: unknown): value is TerraformDraft {
  if (!value || typeof value !== 'object') return false;
  return (
    'mode' in value &&
    T.modes.some((m) => m === value.mode) &&
    'radius' in value &&
    T.radii.some((r) => r === value.radius) &&
    'points' in value &&
    Array.isArray(value.points) &&
    value.points.length > 0 &&
    value.points.length <= T.maxPoints &&
    value.points.every(finitePoint)
  );
}
/** Atomic sparse edit. Protect every terrain triangle supporting roads and buildings. */
export function previewTerraform(
  w: RoadConstructionWorld,
  draft: TerraformDraft,
): TerraformPreview {
  const reject = (reason: TerraformReason): TerraformPreview => ({
    patch: { indices: [], heights: [] },
    reason,
  });
  if (!isTerraformDraft(draft)) return reject('err.invalidCommand');
  if (w.mode !== 'sandbox') return reject('err.terraformSandbox');
  const step = WORLD.heightmapSpacingM,
    size = WORLD.heightmapVertices,
    half = MAP_SIZE / 2;
  const samples: Vec2[] = [];
  for (let i = 0; i < draft.points.length; i++) {
    const b = draft.points[i]!,
      a = draft.points[Math.max(0, i - 1)]!;
    if (!ownedPoint(b, w.ownedTiles)) return reject('err.landNotOwned');
    const n = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (step / 2)),
    );
    if (samples.length + n > T.maxSamples) return reject('err.invalidCommand');
    for (let k = 1; k <= n; k++)
      samples.push({
        x: a.x + ((b.x - a.x) * k) / n,
        z: a.z + ((b.z - a.z) * k) / n,
      });
  }
  const weights = new Map<number, number>();
  for (const p of samples) {
    const x0 = Math.max(0, Math.ceil((p.x - draft.radius + half) / step)),
      x1 = Math.min(size - 1, Math.floor((p.x + draft.radius + half) / step));
    const z0 = Math.max(0, Math.ceil((p.z - draft.radius + half) / step)),
      z1 = Math.min(size - 1, Math.floor((p.z + draft.radius + half) / step));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const distance = Math.hypot(
          x * step - half - p.x,
          z * step - half - p.z,
        );
        if (distance >= draft.radius) continue;
        const u = 1 - distance / draft.radius,
          weight = u * u * (3 - 2 * u),
          id = z * size + x;
        weights.set(id, Math.max(weights.get(id) ?? 0, weight));
        if (weights.size > T.maxVertices) return reject('err.invalidCommand');
      }
  }
  const padding = step * Math.SQRT2;
  const bounds = w.buildings.map((b) =>
    polygonBounds(zoneBuildingFootprint(b)),
  );
  const nodes = new Map(w.nodes.map((n) => [n.id, n]));
  const roads = w.segments.map((r) => ({
    points: sampleRoad(r, nodes.get(r.start)!, nodes.get(r.end)!),
    reach: ROADS[r.type].widthM / 2 + padding,
  }));
  const target =
    draft.mode === 'river'
      ? SEA_LEVEL - T.riverDepthM
      : meshHeightAt(w.heights, draft.points[0]!.x, draft.points[0]!.z);
  const patch: TerrainPatch = { indices: [], heights: [] };
  for (const [id, weight] of weights) {
    const p = {
      x: (id % size) * step - half,
      z: Math.floor(id / size) * step - half,
    };
    const before = w.heights[id]!;
    const value = Math.fround(
      clamp(
        draft.mode === 'raise'
          ? before + T.stepM * weight
          : draft.mode === 'lower'
            ? before - T.stepM * weight
            : before + (target - before) * weight,
        ...WORLD.heightRangeM,
      ),
    );
    if (value === before) continue;
    if (!ownedPoint(p, w.ownedTiles)) return reject('err.landNotOwned');
    if (
      bounds.some(
        (b) =>
          p.x >= b.minX - padding &&
          p.x <= b.maxX + padding &&
          p.z >= b.minZ - padding &&
          p.z <= b.maxZ + padding,
      )
    )
      return reject('err.terraformProtected');
    for (const r of roads)
      for (let i = 1; i < r.points.length; i++)
        if (
          closestPointOnSegment(p, r.points[i - 1]!, r.points[i]!).distance <=
          r.reach
        )
          return reject('err.terraformProtected');
    patch.indices.push(id);
    patch.heights.push(value);
  }
  return patch.indices.length
    ? { patch, reason: null }
    : reject('err.terraformEmpty');
}
