import {
  closestPointOnSegment,
  distance,
  segmentIntersection,
} from '../core/math';
import { BULLDOZE } from '../data/bulldoze';
import { ROADS } from '../data/roads';
import type { BulldozeKind, BulldozeTarget, BulldozeWorld } from './bulldoze';
import { sampleRoad } from './roadProfile';
import { zoneBuildingFootprint } from './zoneGeometry';
import type { Vec2 } from './types';

export interface BulldozeShape {
  target: BulldozeTarget;
  points: Vec2[];
  width: number;
  closed: boolean;
}
function inside(p: Vec2, polygon: readonly Vec2[]): boolean {
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) >= 0;
  });
}
function gap(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentIntersection(a, b, c, d)) return 0;
  return Math.min(
    closestPointOnSegment(a, c, d).distance,
    closestPointOnSegment(b, c, d).distance,
    closestPointOnSegment(c, a, b).distance,
    closestPointOnSegment(d, a, b).distance,
  );
}
/** World-event cache used by both hit testing and the red demolition overlay. */
export class BulldozeSelection {
  readonly shapes: BulldozeShape[] = [];
  constructor(private readonly world: BulldozeWorld) {
    const nodes = new Map(world.nodes.map((n) => [n.id, n]));
    for (const s of world.segments)
      this.shapes.push({
        target: { kind: 'segment', id: s.id },
        points: sampleRoad(s, nodes.get(s.start)!, nodes.get(s.end)!),
        width: ROADS[s.type].widthM,
        closed: false,
      });
    for (const b of world.buildings)
      this.shapes.push({
        target: { kind: 'building', id: b.id },
        points: zoneBuildingFootprint(b),
        width: 0,
        closed: true,
      });
    for (const n of Object.values(world.networks).flat())
      this.shapes.push({
        target: { kind: 'network', id: n.id },
        points: n.points,
        width: BULLDOZE.overlayWidthM,
        closed: false,
      });
  }
  /** A junction click selects its connected arms; a stroke selects only crossed objects. */
  pick(a: Vec2, b: Vec2, kind: BulldozeKind): BulldozeTarget[] {
    const tap = distance(a, b) === 0;
    if (tap && kind === 'segment') {
      const junction = this.world.nodes
        .filter(
          (n) =>
            n.segments.length >= 3 &&
            distance(a, n.pos) <= BULLDOZE.junctionRadiusM,
        )
        .sort(
          (l, r) => distance(a, l.pos) - distance(a, r.pos) || l.id - r.id,
        )[0];
      if (junction)
        return junction.segments.map((id) => ({ kind: 'segment', id }));
    }
    const hits: { target: BulldozeTarget; distance: number }[] = [];
    for (const shape of this.shapes) {
      if (shape.target.kind !== kind) continue;
      let d =
        shape.closed && (inside(a, shape.points) || inside(b, shape.points))
          ? 0
          : Infinity;
      for (
        let i = 0;
        i < (shape.closed ? shape.points.length : shape.points.length - 1);
        i++
      )
        d = Math.min(
          d,
          gap(
            a,
            b,
            shape.points[i]!,
            shape.points[(i + 1) % shape.points.length]!,
          ),
        );
      if (d <= shape.width / 2 + BULLDOZE.pointerRadiusM)
        hits.push({ target: shape.target, distance: d });
    }
    hits.sort((l, r) => l.distance - r.distance || l.target.id - r.target.id);
    return (tap ? hits.slice(0, 1) : hits).map((h) => h.target);
  }
  outlines(targets: readonly BulldozeTarget[]): BulldozeShape[] {
    const keys = new Set(targets.map((t) => `${t.kind}:${t.id}`));
    return this.shapes.filter((s) =>
      keys.has(`${s.target.kind}:${s.target.id}`),
    );
  }
}
