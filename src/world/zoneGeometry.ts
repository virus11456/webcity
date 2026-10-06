import { lerp } from '../core/math';
import { CELL_SIZE, MAP_SIZE, SEA_LEVEL, WORLD } from '../data/config';
import { GROWTH } from '../data/zones';
import { ZONE_GRID as C } from '../data/zoneGrid';
import type { Building, Vec2 } from './types';
export type Polygon = readonly Vec2[];
/** Bounds used for broad-phase queries before exact positive-area clipping. */
export function polygonBounds(p: Polygon) {
  return {
    minX: Math.min(...p.map((v) => v.x)),
    maxX: Math.max(...p.map((v) => v.x)),
    minZ: Math.min(...p.map((v) => v.z)),
    maxZ: Math.max(...p.map((v) => v.z)),
  };
}
function area(p: Polygon): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!,
      b = p[(i + 1) % p.length]!;
    sum += a.x * b.z - a.z * b.x;
  }
  return Math.abs(sum) / 2;
}
function clip(subject: Polygon, boundary: Polygon): Vec2[] {
  let output = [...subject];
  for (let i = 0; i < boundary.length && output.length; i++) {
    const a = boundary[i]!,
      b = boundary[(i + 1) % boundary.length]!,
      side = (p: Vec2) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const input = output;
    output = [];
    let previous = input[input.length - 1]!,
      ps = side(previous);
    for (const p of input) {
      const s = side(p);
      if (s >= 0 !== ps >= 0) output.push(lerp(previous, p, ps / (ps - s)));
      if (s >= 0) output.push(p);
      previous = p;
      ps = s;
    }
  }
  return output;
}
/** Touching edges are legal; only overlapping interiors conflict. Polygons must be convex and CCW. */
export function zonePolygonsOverlap(a: Polygon, b: Polygon): boolean {
  return area(clip(a, b)) > C.areaEpsilonM2;
}
/** The building origin is front-centre, matching TECH and the road collision convention. */
export function zoneBuildingFootprint(b: Building): Vec2[] {
  const ux = Math.cos(b.rotation),
    uz = -Math.sin(b.rotation),
    nx = -uz,
    nz = ux,
    w = (b.lotW * CELL_SIZE) / 2,
    d = b.lotD * CELL_SIZE;
  return [
    { x: b.pos.x - ux * w, z: b.pos.z - uz * w },
    { x: b.pos.x + ux * w, z: b.pos.z + uz * w },
    { x: b.pos.x + ux * w + nx * d, z: b.pos.z + uz * w + nz * d },
    { x: b.pos.x - ux * w + nx * d, z: b.pos.z - uz * w + nz * d },
  ];
}
/** Reject map overflow, water slivers and steep triangle planes anywhere under the cell. */
export function zoneTerrainValid(p: Polygon, heights: Float32Array): boolean {
  const half = MAP_SIZE / 2,
    step = WORLD.heightmapSpacingM,
    size = WORLD.heightmapVertices;
  if (
    p.some(
      (v) =>
        Math.abs(v.x) > half + C.positionEpsilonM ||
        Math.abs(v.z) > half + C.positionEpsilonM,
    )
  )
    return false;
  const box = polygonBounds(p),
    index = (v: number) =>
      Math.max(0, Math.min(size - 2, Math.floor((v + half) / step)));
  for (let z = index(box.minZ); z <= index(box.maxZ); z++)
    for (let x = index(box.minX); x <= index(box.maxX); x++) {
      const wx = x * step - half,
        wz = z * step - half,
        k = z * size + x,
        a = heights[k]!,
        b = heights[k + 1]!,
        c = heights[k + size]!,
        d = heights[k + size + 1]!;
      for (const t of [
        {
          polygon: [
            { x: wx, z: wz },
            { x: wx + step, z: wz },
            { x: wx, z: wz + step },
          ],
          x: wx,
          z: wz,
          h: a,
          gx: (b - a) / step,
          gz: (c - a) / step,
        },
        {
          polygon: [
            { x: wx + step, z: wz + step },
            { x: wx, z: wz + step },
            { x: wx + step, z: wz },
          ],
          x: wx + step,
          z: wz + step,
          h: d,
          gx: (d - c) / step,
          gz: (d - b) / step,
        },
      ]) {
        const hit = clip(p, t.polygon);
        if (area(hit) <= C.areaEpsilonM2) continue;
        if (
          ![t.h, t.gx, t.gz].every(Number.isFinite) ||
          Math.hypot(t.gx, t.gz) > GROWTH.invalidSlopeAbove + C.slopeEpsilon
        )
          return false;
        if (
          hit.some(
            (v) => t.h + t.gx * (v.x - t.x) + t.gz * (v.z - t.z) <= SEA_LEVEL,
          )
        )
          return false;
      }
    }
  return true;
}
/** Rectangle spatial index for roads/buildings; long objects occupy every crossed bucket. */
export class ZonePolygonIndex<T> {
  private buckets = new Map<string, Set<{ polygon: Polygon; value: T }>>();
  private keys(p: Polygon): string[] {
    const b = polygonBounds(p),
      keys: string[] = [];
    for (
      let z = Math.floor(b.minZ / C.spatialBucketM);
      z <= Math.floor(b.maxZ / C.spatialBucketM);
      z++
    )
      for (
        let x = Math.floor(b.minX / C.spatialBucketM);
        x <= Math.floor(b.maxX / C.spatialBucketM);
        x++
      )
        keys.push(`${x},${z}`);
    return keys;
  }
  add(polygon: Polygon, value: T): void {
    const item = { polygon, value };
    for (const key of this.keys(polygon)) {
      const bucket = this.buckets.get(key) ?? new Set();
      bucket.add(item);
      this.buckets.set(key, bucket);
    }
  }
  overlaps(p: Polygon, ignore?: (value: T) => boolean): boolean {
    const seen = new Set<{ polygon: Polygon; value: T }>();
    for (const key of this.keys(p))
      for (const item of this.buckets.get(key) ?? []) {
        if (seen.has(item)) continue;
        seen.add(item);
        if (!ignore?.(item.value) && zonePolygonsOverlap(p, item.polygon))
          return true;
      }
    return false;
  }
}
