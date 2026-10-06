import { clamp } from '../core/math';
import { MAP_SIZE, WORLD } from '../data/config';
import { ROAD_MESH } from '../data/roadMesh';
import { ROADS } from '../data/roads';
import { sampleRoad } from './roadProfile';
import type { RoadNode, RoadSegment } from './types';
export interface TerrainPatch {
  indices: number[];
  heights: number[];
}
/** Compute sparse earthworks without mutating input. Elevated roads do not alter ground. */
export function roadBedPatch(
  heights: Float32Array,
  nodes: readonly RoadNode[],
  segments: readonly RoadSegment[],
): TerrainPatch {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const targets = new Map<number, number>();
  const step = WORLD.heightmapSpacingM,
    size = WORLD.heightmapVertices,
    half = MAP_SIZE / 2;
  for (const segment of segments) {
    if (segment.elevated) continue;
    const points = sampleRoad(
      segment,
      byId.get(segment.start)!,
      byId.get(segment.end)!,
    );
    // Include the entire triangle supporting the road edge, not just vertices inside a narrow road.
    const reach = ROADS[segment.type].widthM / 2 + step * Math.SQRT2;
    for (let p = 1; p < points.length; p++) {
      const a = points[p - 1]!,
        b = points[p]!;
      const x0 = clamp(
        Math.floor((Math.min(a.x, b.x) - reach + half) / step),
        0,
        size - 1,
      );
      const x1 = clamp(
        Math.ceil((Math.max(a.x, b.x) + reach + half) / step),
        0,
        size - 1,
      );
      const z0 = clamp(
        Math.floor((Math.min(a.z, b.z) - reach + half) / step),
        0,
        size - 1,
      );
      const z1 = clamp(
        Math.ceil((Math.max(a.z, b.z) + reach + half) / step),
        0,
        size - 1,
      );
      const dx = b.x - a.x,
        dz = b.z - a.z,
        length2 = dx * dx + dz * dz;
      if (!length2) continue;
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const wx = x * step - half,
            wz = z * step - half;
          const t = clamp(((wx - a.x) * dx + (wz - a.z) * dz) / length2, 0, 1);
          if (Math.hypot(wx - a.x - dx * t, wz - a.z - dz * t) > reach)
            continue;
          const index = z * size + x;
          const h = a.y + (b.y - a.y) * t - ROAD_MESH.bedClearanceM;
          targets.set(index, Math.min(targets.get(index) ?? Infinity, h));
        }
    }
  }
  const patch: TerrainPatch = { indices: [], heights: [] };
  for (const [index, h] of targets) {
    const value = Math.fround(h);
    if (heights[index] === value) continue;
    patch.indices.push(index);
    patch.heights.push(value);
  }
  return patch;
}
