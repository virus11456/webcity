import { projectCurve } from '../world/roadCurves';
import { cubicBezier, distance } from '../core/math';
import { meshHeightAt } from './heightField';
import { ROAD_GRAPH_PRECISION } from '../data/roadGraph';
import { ROAD_MESH } from '../data/roadMesh';
import type { RoadNode, RoadSegment, Vec2 } from './types';
export interface RoadSample extends Vec2 {
  y: number;
  distance: number;
}
/** Sample a cubic centreline with endpoint grades; shared by road mesh and worker earthworks. */
export function sampleRoad(
  segment: RoadSegment,
  start: RoadNode,
  end: RoadNode,
): RoadSample[] {
  const controlLength =
    distance(start.pos, segment.c1) +
    distance(segment.c1, segment.c2) +
    distance(segment.c2, end.pos);
  const steps = Math.max(1, Math.ceil(controlLength / ROAD_MESH.sampleM));
  const points: RoadSample[] = [];
  let travelled = 0;
  for (let i = 0; i <= steps; i++) {
    const p = cubicBezier(
      start.pos,
      segment.c1,
      segment.c2,
      end.pos,
      i / steps,
    );
    if (i) travelled += distance(points[i - 1]!, p);
    points.push({
      ...p,
      y: start.height + ((end.height - start.height) * i) / steps,
      distance: travelled,
    });
  }
  return points;
}

/** Preserve the grade of existing ground roads when terrain has been cut below their deck. */
export function roadHeightAt(
  nodes: readonly RoadNode[],
  segments: readonly RoadSegment[],
  heights: Float32Array,
  point: Vec2,
): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const s of segments) {
    if (s.elevated) continue;
    const a = byId.get(s.start)!,
      b = byId.get(s.end)!;
    const hit = projectCurve(point, [a.pos, s.c1, s.c2, b.pos]);
    if (hit.distance <= ROAD_GRAPH_PRECISION.positionM)
      return a.height + (b.height - a.height) * hit.t;
  }
  return meshHeightAt(heights, point.x, point.z);
}
