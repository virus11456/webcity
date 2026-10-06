import {
  CELL_SIZE,
  MAP_SIZE,
  MAP_TILES,
  SEA_LEVEL,
  TILE_SIZE,
  WORLD,
} from '../data/config';
import { ROAD_GRAPH_PRECISION as EPS } from '../data/roadGraph';
import { ROAD_GEOMETRY_PRECISION } from '../data/roadGeometry';
import { ROADS, ROAD_RULES, type RoadTypeId } from '../data/roads';
import { closestPointOnSegment, distance, lerp } from '../core/math';
import { meshHeightAt } from './heightField';
import { RoadGraph, RoadGraphError, type RoadGraphSnapshot } from './roadGraph';
import type { Building, Vec2 } from './types';
import type { RoadDraft } from './snapshot';

export type RoadBuildReason =
  | 'err.invalidCommand'
  | 'err.outsideMap'
  | 'err.roadTooShort'
  | 'err.landNotOwned'
  | 'err.roadInWater'
  | 'err.slopeTooSteep'
  | 'err.buildingConflict'
  | 'err.roadOverlap'
  | 'err.angleTooSmall';
export interface RoadGeometryWorld extends RoadGraphSnapshot {
  heights: Float32Array;
  ownedTiles: readonly number[];
  buildings: readonly Pick<Building, 'pos' | 'rotation' | 'lotW' | 'lotD'>[];
}
export interface RoadSnapOptions {
  angle?: boolean;
  length?: boolean;
  connections?: boolean;
}
export interface RoadSnap {
  pos: Vec2;
  height: number;
  kind: 'none' | 'node' | 'segment';
  id?: number;
}
export interface StraightRoadRequest {
  start: Vec2;
  end: Vec2;
  type: RoadTypeId;
  snap?: RoadSnapOptions;
}
export interface RoadPreview {
  draft: RoadDraft;
  start: RoadSnap;
  end: RoadSnap;
  length: number;
  cost: number;
  /** Maximum absolute longitudinal rise/run, including terrain between endpoints. */
  slope: number;
  footprint: Vec2[];
}
export interface RoadPreviewResult {
  canBuild: boolean;
  reason: RoadBuildReason | null;
  preview: RoadPreview | null;
}
const finitePoint = (p: Vec2) =>
  p && Number.isFinite(p.x) && Number.isFinite(p.z);
const inMap = (p: Vec2) =>
  Math.abs(p.x) <= MAP_SIZE / 2 && Math.abs(p.z) <= MAP_SIZE / 2;
const height = (world: RoadGeometryWorld, p: Vec2) =>
  meshHeightAt(world.heights, p.x, p.z);

/** Snap to the nearest ground node, then ground segment, strictly within 8 m; ties use ID. */
export function snapRoadPoint(
  point: Vec2,
  world: RoadGeometryWorld,
  enabled = true,
): RoadSnap {
  const free: RoadSnap = {
    pos: { ...point },
    height: height(world, point),
    kind: 'none',
  };
  if (!enabled) return free;
  let best: RoadSnap | undefined;
  let nearest = ROAD_RULES.nodeSnapDistanceM as number;
  for (const node of [...world.nodes].sort((a, b) => a.id - b.id)) {
    const d = distance(point, node.pos);
    // This MVP only connects ground roads; bridge picking belongs to M2-04.
    if (
      d < nearest &&
      Math.abs(node.height - height(world, node.pos)) <= EPS.heightM
    ) {
      nearest = d;
      best = {
        pos: { ...node.pos },
        height: node.height,
        kind: 'node',
        id: node.id,
      };
    }
  }
  if (best) return best;
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  for (const segment of [...world.segments].sort((a, b) => a.id - b.id)) {
    if (segment.elevated) continue;
    const a = nodes.get(segment.start)!,
      b = nodes.get(segment.end)!;
    const hit = closestPointOnSegment(point, a.pos, b.pos);
    if (hit.distance < nearest) {
      nearest = hit.distance;
      best = {
        pos: hit.point,
        height: a.height * (1 - hit.t) + b.height * hit.t,
        kind: 'segment',
        id: segment.id,
      };
    }
  }
  return best ?? free;
}

/** Snap an endpoint to 15° and/or 8 m increments relative to a reference direction. */
export function snapRoadVector(
  start: Vec2,
  end: Vec2,
  referenceAngle = 0,
  options: RoadSnapOptions = {},
): Vec2 {
  const rawLength = distance(start, end);
  if (rawLength === 0) return { ...start };
  let angle = Math.atan2(end.z - start.z, end.x - start.x);
  const step = (ROAD_RULES.snapAngleDegrees * Math.PI) / 180;
  if (options.angle !== false)
    angle = referenceAngle + Math.round((angle - referenceAngle) / step) * step;
  const length =
    options.length === false
      ? rawLength
      : Math.round(rawLength / ROAD_RULES.snapLengthM) * ROAD_RULES.snapLengthM;
  return {
    x: start.x + Math.cos(angle) * length,
    z: start.z + Math.sin(angle) * length,
  };
}

/** Ground-road cost is proportional to planar metres, rounded up once to whole currency. */
export function roadConstructionCost(type: RoadTypeId, length: number): number {
  return Math.ceil(
    Math.max(
      0,
      (length / CELL_SIZE) * ROADS[type].costPer8M -
        ROAD_GEOMETRY_PRECISION.currency,
    ),
  );
}

function referenceAngle(
  start: RoadSnap,
  end: Vec2,
  world: RoadGeometryWorld,
): number {
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  const candidates = world.segments
    .filter((segment) =>
      start.kind === 'node'
        ? segment.start === start.id || segment.end === start.id
        : start.kind === 'segment' && segment.id === start.id,
    )
    .sort((a, b) => a.id - b.id);
  let angle = 0,
    error = Infinity;
  for (const segment of candidates) {
    const a = nodes.get(segment.start)!.pos,
      b = nodes.get(segment.end)!.pos;
    const candidate = Math.atan2(b.z - a.z, b.x - a.x);
    const snapped = snapRoadVector(start.pos, end, candidate, {
      length: false,
    });
    const difference = distance(snapped, end);
    if (difference < error) {
      angle = candidate;
      error = difference;
    }
  }
  return angle;
}

// Counterclockwise convex polygon clipping. Checking area treats touching boundaries as legal.
function clip(subject: readonly Vec2[], boundary: readonly Vec2[]): Vec2[] {
  let output = [...subject];
  for (let i = 0; i < boundary.length && output.length; i++) {
    const a = boundary[i]!,
      b = boundary[(i + 1) % boundary.length]!;
    const side = (p: Vec2) =>
      (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const input = output;
    output = [];
    let previous = input[input.length - 1]!,
      previousSide = side(previous);
    for (const current of input) {
      const currentSide = side(current);
      if (currentSide >= 0 !== previousSide >= 0)
        output.push(
          lerp(previous, current, previousSide / (previousSide - currentSide)),
        );
      if (currentSide >= 0) output.push(current);
      previous = current;
      previousSide = currentSide;
    }
  }
  return output;
}
function area(polygon: readonly Vec2[]): number {
  if (polygon.length < 3) return 0;
  const origin = polygon[0]!;
  let sum = 0;
  for (let i = 1; i + 1 < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[i + 1]!;
    sum +=
      (a.x - origin.x) * (b.z - origin.z) - (b.x - origin.x) * (a.z - origin.z);
  }
  return Math.abs(sum) / 2;
}
const overlaps = (a: readonly Vec2[], b: readonly Vec2[]) =>
  area(clip(a, b)) > EPS.positionM ** 2;
const rectangle = (
  x: number,
  z: number,
  size: number,
  depth = size,
): Vec2[] => [
  { x, z },
  { x: x + size, z },
  { x: x + size, z: z + depth },
  { x, z: z + depth },
];
function bounds(polygon: readonly Vec2[]) {
  return {
    minX: Math.min(...polygon.map((p) => p.x)),
    maxX: Math.max(...polygon.map((p) => p.x)),
    minZ: Math.min(...polygon.map((p) => p.z)),
    maxZ: Math.max(...polygon.map((p) => p.z)),
  };
}
function owned(footprint: readonly Vec2[], tiles: readonly number[]): boolean {
  for (let z = 0; z < MAP_TILES; z++)
    for (let x = 0; x < MAP_TILES; x++) {
      if (
        !tiles.includes(z * MAP_TILES + x) &&
        overlaps(
          footprint,
          rectangle(
            x * TILE_SIZE - MAP_SIZE / 2,
            z * TILE_SIZE - MAP_SIZE / 2,
            TILE_SIZE,
          ),
        )
      )
        return false;
    }
  return true;
}
function buildingFootprint(
  building: RoadGeometryWorld['buildings'][number],
): Vec2[] {
  const { pos, rotation, lotW, lotD } = building;
  const wx = (Math.cos(rotation) * lotW * CELL_SIZE) / 2,
    wz = (-Math.sin(rotation) * lotW * CELL_SIZE) / 2;
  const dx = Math.sin(rotation) * lotD * CELL_SIZE,
    dz = Math.cos(rotation) * lotD * CELL_SIZE;
  return [
    { x: pos.x - wx, z: pos.z - wz },
    { x: pos.x + wx, z: pos.z + wz },
    { x: pos.x + wx + dx, z: pos.z + wz + dz },
    { x: pos.x - wx + dx, z: pos.z - wz + dz },
  ];
}

/** Exact triangle-plane extrema over the road footprint; narrow water and interior hills cannot fall between samples. */
function terrainProfile(
  footprint: Vec2[],
  world: RoadGeometryWorld,
  ux: number,
  uz: number,
): { minHeight: number; slope: number; valid: boolean } {
  const box = bounds(footprint),
    spacing = WORLD.heightmapSpacingM,
    size = WORLD.heightmapVertices;
  const index = (v: number) =>
    Math.max(0, Math.min(size - 2, Math.floor((v + MAP_SIZE / 2) / spacing)));
  let minHeight = Infinity,
    slope = 0;
  for (let j = index(box.minZ); j <= index(box.maxZ); j++) {
    const row = clip(
      footprint,
      rectangle(-MAP_SIZE / 2, j * spacing - MAP_SIZE / 2, MAP_SIZE, spacing),
    );
    if (area(row) <= EPS.positionM ** 2) continue;
    const rowBounds = bounds(row);
    for (let i = index(rowBounds.minX); i <= index(rowBounds.maxX); i++) {
      const x = i * spacing - MAP_SIZE / 2,
        z = j * spacing - MAP_SIZE / 2;
      if (!overlaps(footprint, rectangle(x, z, spacing))) continue;
      const k = j * size + i;
      const a = world.heights[k]!,
        b = world.heights[k + 1]!,
        c = world.heights[k + size]!,
        d = world.heights[k + size + 1]!;
      if (![a, b, c, d].every(Number.isFinite))
        return { minHeight, slope, valid: false };
      const triangles = [
        {
          polygon: [
            { x, z },
            { x: x + spacing, z },
            { x, z: z + spacing },
          ],
          h: a,
          x,
          z,
          gx: (b - a) / spacing,
          gz: (c - a) / spacing,
        },
        {
          polygon: [
            { x: x + spacing, z: z + spacing },
            { x, z: z + spacing },
            { x: x + spacing, z },
          ],
          h: d,
          x: x + spacing,
          z: z + spacing,
          gx: (d - c) / spacing,
          gz: (d - b) / spacing,
        },
      ];
      for (const triangle of triangles) {
        const intersection = clip(footprint, triangle.polygon);
        if (area(intersection) <= EPS.positionM ** 2) continue;
        slope = Math.max(slope, Math.abs(triangle.gx * ux + triangle.gz * uz));
        for (const p of intersection)
          minHeight = Math.min(
            minHeight,
            triangle.h +
              triangle.gx * (p.x - triangle.x) +
              triangle.gz * (p.z - triangle.z),
          );
      }
    }
  }
  return { minHeight, slope, valid: Number.isFinite(minHeight) };
}

/** Shared pure MVP ground-road preview and validation; never changes terrain, money or topology. */
export function previewStraightRoad(
  request: StraightRoadRequest,
  world: RoadGeometryWorld,
): RoadPreviewResult {
  const reject = (
    reason: RoadBuildReason,
    preview: RoadPreview | null = null,
  ): RoadPreviewResult => ({ canBuild: false, reason, preview });
  if (
    !finitePoint(request.start) ||
    !finitePoint(request.end) ||
    !Object.hasOwn(ROADS, request.type) ||
    world.heights.length !== WORLD.heightmapVertices ** 2
  )
    return reject('err.invalidCommand');
  if (!inMap(request.start) || !inMap(request.end))
    return reject('err.outsideMap');
  const start = snapRoadPoint(
    request.start,
    world,
    request.snap?.connections !== false,
  );
  let end = snapRoadPoint(
    request.end,
    world,
    request.snap?.connections !== false,
  );
  // An exact connection wins over angle/length rounding; never round a T junction off its road.
  if (end.kind === 'none') {
    const pos = snapRoadVector(
      start.pos,
      request.end,
      referenceAngle(start, request.end, world),
      request.snap,
    );
    end = snapRoadPoint(pos, world, request.snap?.connections !== false);
  }
  const length = distance(start.pos, end.pos);
  if (![start.height, end.height, length].every(Number.isFinite))
    return reject('err.invalidCommand');
  const ux = length ? (end.pos.x - start.pos.x) / length : 0,
    uz = length ? (end.pos.z - start.pos.z) / length : 0;
  const halfWidth = ROADS[request.type].widthM / 2;
  const offset = (p: Vec2, side: number) => ({
    x: p.x - uz * halfWidth * side,
    z: p.z + ux * halfWidth * side,
  });
  const footprint = [
    offset(start.pos, -1),
    offset(end.pos, -1),
    offset(end.pos, 1),
    offset(start.pos, 1),
  ];
  const preview: RoadPreview = {
    draft: {
      start: { ...start.pos },
      end: { ...end.pos },
      c1: lerp(start.pos, end.pos, 1 / 3),
      c2: lerp(start.pos, end.pos, 2 / 3),
      elevated: false,
    },
    start,
    end,
    length,
    cost: roadConstructionCost(request.type, length),
    slope: length ? Math.abs(end.height - start.height) / length : 0,
    footprint,
  };
  if (length + EPS.positionM < ROAD_RULES.minSegmentM)
    return reject('err.roadTooShort', preview);
  if (!footprint.every(inMap)) return reject('err.outsideMap', preview);
  if (!owned(footprint, world.ownedTiles))
    return reject('err.landNotOwned', preview);
  const profile = terrainProfile(footprint, world, ux, uz);
  if (!profile.valid) return reject('err.invalidCommand', preview);
  preview.slope = Math.max(preview.slope, profile.slope);
  if (profile.minHeight < SEA_LEVEL - EPS.heightM)
    return reject('err.roadInWater', preview);
  const maxSlope =
    request.type === 'highway' || request.type === 'highway_ramp'
      ? ROAD_RULES.highwayMaxSlope
      : ROAD_RULES.maxSlope;
  if (preview.slope > maxSlope + ROAD_GEOMETRY_PRECISION.slopeRatio)
    return reject('err.slopeTooSteep', preview);
  if (
    world.buildings.some((building) =>
      overlaps(footprint, buildingFootprint(building)),
    )
  )
    return reject('err.buildingConflict', preview);
  try {
    RoadGraph.previewRoad(world, {
      start: start.pos,
      end: end.pos,
      startHeight: start.height,
      endHeight: end.height,
      type: request.type,
      builtDay: 0,
    });
  } catch (error) {
    if (!(error instanceof RoadGraphError)) throw error;
    const reason =
      error.code === 'overlap'
        ? 'err.roadOverlap'
        : error.code === 'tooShort'
          ? 'err.roadTooShort'
          : error.code === 'angleTooSmall'
            ? 'err.angleTooSmall'
            : 'err.invalidCommand';
    return reject(reason, preview);
  }
  return { canBuild: true, reason: null, preview };
}
