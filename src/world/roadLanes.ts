import { ROADS, type RoadTypeId } from '../data/roads';
import { ROAD_MESH as C } from '../data/roadMesh';
import { curveSamples, curveTangent } from './roadCurves';
import { distance } from '../core/math';
import type { RoadNode, RoadSegment, Vec2 } from './types';
export interface LanePoint extends Vec2 {
  y: number;
  distance: number;
}
/** Derived from authoritative roads; IDs stay stable until that road is split or replaced. */
export interface Lane {
  id: string;
  segment: number;
  index: number;
  direction: 1 | -1;
  start: number;
  end: number;
  offset: number;
  width: number;
  speedMps: number;
  length: number;
  points: LanePoint[];
}
export function roadCrossSection(type: RoadTypeId) {
  const sidewalk =
    type === 'gravel' || type.startsWith('highway') ? 0 : C.sidewalkM;
  const median = type === 'road_large' ? C.medianM : 0;
  const inner = ROADS[type].widthM / 2 - sidewalk;
  return {
    sidewalk,
    median,
    inner,
    laneWidth:
      (inner * 2 - median) /
      (ROADS[type].lanesForward + ROADS[type].lanesBackward),
  };
}
export function laneOffsets(
  type: RoadTypeId,
): { index: number; direction: 1 | -1; offset: number }[] {
  const def = ROADS[type],
    s = roadCrossSection(type),
    result: { index: number; direction: 1 | -1; offset: number }[] = [];
  for (const direction of [1, -1] as const)
    for (
      let index = 0;
      index < (direction === 1 ? def.lanesForward : def.lanesBackward);
      index++
    ) {
      const offset =
        def.lanesBackward === 0
          ? -s.inner + (index + 0.5) * s.laneWidth
          : direction * (s.median / 2 + (index + 0.5) * s.laneWidth);
      result.push({ index, direction, offset });
    }
  return result;
}
/** Driving paths use the same cross-section as rendered lane dividers and arrows. */
export function segmentLanes(
  s: RoadSegment,
  start: RoadNode,
  end: RoadNode,
): Lane[] {
  const c = [start.pos, s.c1, s.c2, end.pos] as const,
    samples = curveSamples(c),
    section = roadCrossSection(s.type);
  return laneOffsets(s.type).map((lane) => {
    let length = 0;
    const points: LanePoint[] = [];
    for (const sample of lane.direction === 1
      ? samples
      : [...samples].reverse()) {
      const tangent = curveTangent(c, sample.t),
        l = Math.hypot(tangent.x, tangent.z) || 1;
      const p = {
        x: sample.point.x - (tangent.z / l) * lane.offset,
        z: sample.point.z + (tangent.x / l) * lane.offset,
        y: start.height + (end.height - start.height) * sample.t,
        distance: 0,
      };
      if (points.length) length += distance(points[points.length - 1]!, p);
      p.distance = length;
      points.push(p);
    }
    return {
      ...lane,
      id: `${s.id}:${lane.direction}:${lane.index}`,
      segment: s.id,
      start: lane.direction === 1 ? s.start : s.end,
      end: lane.direction === 1 ? s.end : s.start,
      width: section.laneWidth,
      speedMps: ROADS[s.type].speedKph / 3.6,
      length,
      points,
    };
  });
}
export function generateRoadLanes(
  nodes: readonly RoadNode[],
  segments: readonly RoadSegment[],
): Lane[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return segments.flatMap((s) =>
    segmentLanes(s, byId.get(s.start)!, byId.get(s.end)!),
  );
}
