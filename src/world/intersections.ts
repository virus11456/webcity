import { INTERSECTIONS as C } from '../data/intersections';
import { ROAD_RULES, ROADS } from '../data/roads';
import { curveTangent } from './roadCurves';
import type { RoadNode, RoadSegment, Vec2 } from './types';
export function pickIntersection(
  nodes: readonly RoadNode[],
  p: Vec2,
): RoadNode | undefined {
  return nodes
    .filter(
      (n) =>
        n.segments.length >= 3 &&
        Math.hypot(p.x - n.pos.x, p.z - n.pos.z) <= C.pickRadiusM,
    )
    .sort(
      (a, b) =>
        Math.hypot(p.x - a.pos.x, p.z - a.pos.z) -
          Math.hypot(p.x - b.pos.x, p.z - b.pos.z) || a.id - b.id,
    )[0];
}
/** Group opposite incoming approaches, independent of arm order or traffic direction. */
export function signalGroups(
  node: RoadNode,
  segments: readonly RoadSegment[],
  nodes: readonly RoadNode[],
): number[][] {
  const byNode = new Map(nodes.map((n) => [n.id, n]));
  const approaches = segments
    .filter(
      (s) =>
        node.segments.includes(s.id) &&
        (s.end === node.id
          ? ROADS[s.type].lanesForward
          : ROADS[s.type].lanesBackward) > 0,
    )
    .map((s) => {
      const t = curveTangent(
        [byNode.get(s.start)!.pos, s.c1, s.c2, byNode.get(s.end)!.pos],
        s.start === node.id ? 0 : 1,
      );
      return {
        id: s.id,
        angle: ((Math.atan2(t.z, t.x) % Math.PI) + Math.PI) % Math.PI,
      };
    })
    .sort((a, b) => a.angle - b.angle || a.id - b.id);
  const groups: { angle: number; ids: number[] }[] = [];
  for (const a of approaches) {
    const g = groups.find(
      (g) =>
        Math.min(
          Math.abs(a.angle - g.angle),
          Math.PI - Math.abs(a.angle - g.angle),
        ) <= C.oppositeToleranceRadians,
    );
    if (g) g.ids.push(a.id);
    else groups.push({ angle: a.angle, ids: [a.id] });
  }
  return groups.map((g) => g.ids);
}
export function greenGroup(
  groups: readonly number[][],
  seconds: number,
): readonly number[] {
  return groups.length
    ? groups[
        Math.floor(Math.max(0, seconds) / ROAD_RULES.greenLightGameSeconds) %
          groups.length
      ]!
    : [];
}
