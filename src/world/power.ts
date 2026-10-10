import { WATER_UTILITY } from '../data/waterUtility';
import type { BuildingDefinition } from '../data/buildings';
import { POWER } from '../data/power';
import { BUILDINGS, NETWORKS } from '../data/buildings';
import {
  CELL_SIZE,
  GAME_MODES,
  MAP_SIZE,
  MAP_TILES,
  TILE_SIZE,
} from '../data/config';
import { ROADS } from '../data/roads';
import { Rng } from '../core/rng';
import {
  closestPointOnSegment,
  distance,
  lerp,
  segmentIntersection,
} from '../core/math';
import {
  zoneBuildingFootprint,
  zonePolygonsOverlap,
  zoneTerrainValid,
  type Polygon,
} from './zoneGeometry';
import { sampleRoad } from './roadProfile';
import { meshHeightAt } from './heightField';
import type { RoadConstructionWorld } from './roadConstruction';
import type { NetworkSegment } from './snapshot';
import type { Vec2 } from './types';
export interface PowerWorld extends RoadConstructionWorld {
  seed: number;
  networks: NetworkSegment[];
}
export type PowerReason =
  | 'err.invalidCommand'
  | 'err.landNotOwned'
  | 'err.notEnoughMoney'
  | 'err.buildingConflict'
  | 'err.roadOverlap'
  | 'err.powerTerrain'
  | 'err.powerLength'
  | 'err.powerLocked'
  | 'err.waterShore'
  | 'err.waterTerrain'
  | 'err.waterLength'
  | 'err.waterNothing'
  | 'err.waterLocked';
export interface PowerPreview {
  points: Vec2[];
  closed: boolean;
  valid: boolean;
  reason: PowerReason | null;
  cost: number;
  output: number;
}
export const finitePoint = (p: unknown): p is Vec2 =>
  !!p &&
  typeof p === 'object' &&
  'x' in p &&
  'z' in p &&
  typeof p.x === 'number' &&
  typeof p.z === 'number' &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.z);
export const plantDefinition = (id: string) =>
  BUILDINGS.find(
    (b) => b.id === id && (POWER.plantIds as readonly string[]).includes(id),
  );
/** Continuous seeded wind field, sampled equally by preview and authority. Range 0..1. */
export function windAt(seed: number, p: Vec2): number {
  const x = p.x / POWER.windCellM,
    z = p.z / POWER.windCellM,
    ix = Math.floor(x),
    iz = Math.floor(z);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const value = (a: number, b: number) =>
    new Rng(
      seed ^
        POWER.windSeed ^
        Math.imul(a, 0x85ebca6b) ^
        Math.imul(b, 0x9e3779b1),
    ).next();
  const u = smooth(x - ix),
    v = smooth(z - iz);
  return (
    (value(ix, iz) * (1 - u) + value(ix + 1, iz) * u) * (1 - v) +
    (value(ix, iz + 1) * (1 - u) + value(ix + 1, iz + 1) * u) * v
  );
}
export function plantOutput(seed: number, id: string, p: Vec2): number {
  const d = plantDefinition(id);
  return d && 'power' in d && d.power.maxMW
    ? d.power.maxMW * (d.power.mode === 'wind' ? windAt(seed, p) : 1)
    : 0;
}
export function ownedPoint(p: Vec2, owned: readonly number[]): boolean {
  if (
    !finitePoint(p) ||
    Math.abs(p.x) >= MAP_SIZE / 2 ||
    Math.abs(p.z) >= MAP_SIZE / 2
  )
    return false;
  return owned.includes(
    Math.floor((p.z + MAP_SIZE / 2) / TILE_SIZE) * MAP_TILES +
      Math.floor((p.x + MAP_SIZE / 2) / TILE_SIZE),
  );
}
export function pathEdges(
  points: readonly Vec2[],
  closed: boolean,
): [Vec2, Vec2][] {
  return points
    .slice(0, closed ? points.length : -1)
    .map((p, i) => [p, points[(i + 1) % points.length]!]);
}
function inside(p: Vec2, polygon: Polygon): boolean {
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    return (
      (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) >= -POWER.epsilon
    );
  });
}
export function shapeDistance(
  a: Polygon,
  ac: boolean,
  b: Polygon,
  bc: boolean,
): number {
  if (
    (ac && b.some((p) => inside(p, a))) ||
    (bc && a.some((p) => inside(p, b)))
  )
    return 0;
  let best = Infinity;
  for (const [p, q] of pathEdges(a, ac))
    for (const [r, s] of pathEdges(b, bc)) {
      if (segmentIntersection(p, q, r, s)) return 0;
      best = Math.min(
        best,
        closestPointOnSegment(p, r, s).distance,
        closestPointOnSegment(q, r, s).distance,
        closestPointOnSegment(r, p, q).distance,
        closestPointOnSegment(s, p, q).distance,
      );
    }
  return best;
}
export function previewFacility(
  w: PowerWorld,
  id: string,
  pos: Vec2,
  rotation: number,
  options: {
    definition?: BuildingDefinition;
    maxSlope?: number;
    maxHeightDifferenceM?: number;
    output?: number;
  } = {},
): PowerPreview {
  const d = options.definition ?? plantDefinition(id);
  const r: PowerPreview = {
    points: [],
    closed: true,
    valid: false,
    reason: 'err.invalidCommand',
    cost: 0,
    output: 0,
  };
  if (
    !d ||
    !finitePoint(pos) ||
    !Number.isFinite(rotation) ||
    !d.footprintCells
  )
    return r;
  rotation %= Math.PI * 2;
  const [lotW, lotD] = d.footprintCells;
  r.points = zoneBuildingFootprint({ pos, rotation, lotW, lotD });
  r.cost = GAME_MODES[w.mode].unlimitedMoney ? 0 : d.cost;
  r.output = options.output ?? plantOutput(w.seed, id, pos);
  if (!GAME_MODES[w.mode].allUnlocked && !w.unlocked.includes(d.unlock))
    r.reason = 'err.powerLocked';
  else if (r.points.some((p) => !ownedPoint(p, w.ownedTiles)))
    r.reason = 'err.landNotOwned';
  else if (
    !zoneTerrainValid(
      r.points,
      w.heights,
      options.maxSlope ?? POWER.maxSlope,
    ) ||
    Math.max(...r.points.map((p) => meshHeightAt(w.heights, p.x, p.z))) -
      Math.min(...r.points.map((p) => meshHeightAt(w.heights, p.x, p.z))) >
      (options.maxHeightDifferenceM ?? POWER.maxHeightDifferenceM)
  )
    r.reason = 'err.powerTerrain';
  else if (
    w.buildings.some((b) =>
      zonePolygonsOverlap(r.points, zoneBuildingFootprint(b)),
    )
  )
    r.reason = 'err.buildingConflict';
  else if (
    w.segments.some((s) => {
      const a = w.nodes.find((n) => n.id === s.start),
        b = w.nodes.find((n) => n.id === s.end);
      if (!a || !b) return false;
      return (
        shapeDistance(r.points, true, sampleRoad(s, a, b), false) <
        ROADS[s.type].widthM / 2 - POWER.epsilon
      );
    })
  )
    r.reason = 'err.roadOverlap';
  else if (r.cost > w.money) r.reason = 'err.notEnoughMoney';
  else {
    r.valid = true;
    r.reason = null;
  }
  return r;
}
export function previewPlant(
  w: PowerWorld,
  id: string,
  pos: Vec2,
  rotation: number,
): PowerPreview {
  return previewFacility(w, id, pos, rotation);
}
export function previewLine(
  w: PowerWorld,
  points: Vec2[],
  net: 'power' | 'water' = 'power',
  allowShort = false,
): PowerPreview {
  const r: PowerPreview = {
    points: [],
    closed: false,
    valid: false,
    reason: 'err.invalidCommand',
    cost: 0,
    output: 0,
  };
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    points.length >
      (net === 'water' ? WATER_UTILITY.maxPoints : POWER.maxPoints) ||
    !points.every(finitePoint)
  )
    return r;
  r.points = points;
  const edges = pathEdges(points, false),
    length = edges.reduce((n, [a, b]) => n + distance(a, b), 0);
  if (
    length > (net === 'water' ? WATER_UTILITY.maxPipeM : POWER.maxLineM) ||
    (net === 'water' && !allowShort && length < WATER_UTILITY.minPipeM) ||
    edges.some(
      ([a, b]) =>
        distance(a, b) <
        (net === 'water' ? WATER_UTILITY.minSegmentM : POWER.minLineM),
    )
  ) {
    r.reason = 'err.powerLength';
    return r;
  }
  r.cost = GAME_MODES[w.mode].unlimitedMoney
    ? 0
    : Math.ceil(length / CELL_SIZE) *
      NETWORKS[net === 'water' ? 1 : 0].costPer8M;
  // Split at every tile boundary; point sampling alone can miss a narrow unowned corner.
  for (const [a, b] of edges) {
    const cuts = [0, 1];
    for (let k = 0; k <= MAP_TILES; k++)
      for (const axis of ['x', 'z'] as const) {
        const delta = b[axis] - a[axis];
        if (!delta) continue;
        const t = (k * TILE_SIZE - MAP_SIZE / 2 - a[axis]) / delta;
        if (t > 0 && t < 1) cuts.push(t);
      }
    cuts.sort((a, b) => a - b);
    const probes = [
      a,
      b,
      ...cuts.slice(1).map((t, i) => lerp(a, b, (t + cuts[i]!) / 2)),
    ];
    if (probes.some((p) => !ownedPoint(p, w.ownedTiles))) {
      r.reason = 'err.landNotOwned';
      return r;
    }
  }
  if (r.cost > w.money) {
    r.reason = 'err.notEnoughMoney';
    return r;
  }
  r.reason = null;
  r.valid = true;
  return r;
}
