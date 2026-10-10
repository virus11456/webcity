import {
  bezierLength,
  closestPointOnBezier,
  cubicBezier,
  distance,
  lerp,
  segmentIntersection,
  closestPointOnSegment,
} from '../core/math';
import { ROAD_CURVES as C } from '../data/roadCurves';
import type { Vec2 } from '../core/math';
export type Cubic = readonly [Vec2, Vec2, Vec2, Vec2];
export const curvePoint = (c: Cubic, t: number): Vec2 => cubicBezier(...c, t);
export const curveLength = (c: Cubic): number =>
  bezierLength(c, C.lengthErrorM);
export function curveTangent(c: Cubic, t: number): Vec2 {
  const u = 1 - t;
  return {
    x:
      3 *
      (u * u * (c[1].x - c[0].x) +
        2 * u * t * (c[2].x - c[1].x) +
        t * t * (c[3].x - c[2].x)),
    z:
      3 *
      (u * u * (c[1].z - c[0].z) +
        2 * u * t * (c[2].z - c[1].z) +
        t * t * (c[3].z - c[2].z)),
  };
}
/** De Casteljau subdivision preserves shape, including its endpoint tangents. */
export function splitCurve(c: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(c[0], c[1], t),
    b = lerp(c[1], c[2], t),
    d = lerp(c[2], c[3], t),
    e = lerp(a, b, t),
    f = lerp(b, d, t),
    p = lerp(e, f, t);
  return [
    [c[0], a, e, p],
    [p, f, d, c[3]],
  ];
}
export function subCurve(c: Cubic, from: number, to: number): Cubic {
  if (from === 0) return splitCurve(c, to)[0];
  return splitCurve(splitCurve(c, from)[1], (to - from) / (1 - from))[0];
}
export function isLinearCurve(c: Cubic): boolean {
  return (
    distance(c[1], lerp(c[0], c[3], 1 / 3)) < C.intersectionErrorM &&
    distance(c[2], lerp(c[0], c[3], 2 / 3)) < C.intersectionErrorM
  );
}
export function projectCurve(p: Vec2, c: Cubic) {
  if (distance(p, c[0]) <= C.intersectionErrorM)
    return { point: { ...c[0] }, t: 0, distance: distance(p, c[0]) };
  if (distance(p, c[3]) <= C.intersectionErrorM)
    return { point: { ...c[3] }, t: 1, distance: distance(p, c[3]) };
  return isLinearCurve(c)
    ? closestPointOnSegment(p, c[0], c[3])
    : closestPointOnBezier(p, c, C.lengthErrorM);
}
export function curveSamples(c: Cubic): { point: Vec2; t: number }[] {
  const n = Math.max(
    1,
    Math.ceil(
      (distance(c[0], c[1]) + distance(c[1], c[2]) + distance(c[2], c[3])) /
        C.sampleM,
    ),
  );
  return Array.from({ length: n + 1 }, (_, i) => ({
    point: curvePoint(c, i / n),
    t: i / n,
  }));
}
/** Find transverse intersections, refining chord candidates on the actual two cubics. */
export function curveIntersections(
  a: Cubic,
  b: Cubic,
): { point: Vec2; t: number; u: number }[] {
  if (isLinearCurve(a) && isLinearCurve(b)) {
    const p = segmentIntersection(a[0], a[3], b[0], b[3]);
    return p
      ? [
          {
            point: p,
            t: closestPointOnSegment(p, a[0], a[3]).t,
            u: closestPointOnSegment(p, b[0], b[3]).t,
          },
        ]
      : [];
  }
  const aa = isLinearCurve(a)
      ? [
          { point: a[0], t: 0 },
          { point: a[3], t: 1 },
        ]
      : curveSamples(a),
    bb = isLinearCurve(b)
      ? [
          { point: b[0], t: 0 },
          { point: b[3], t: 1 },
        ]
      : curveSamples(b);
  const hits: { point: Vec2; t: number; u: number }[] = [];
  for (let i = 1; i < aa.length; i++)
    for (let j = 1; j < bb.length; j++) {
      const l = aa[i - 1]!,
        r = aa[i]!,
        s = bb[j - 1]!,
        v = bb[j]!;
      if (
        Math.max(l.point.x, r.point.x) < Math.min(s.point.x, v.point.x) ||
        Math.min(l.point.x, r.point.x) > Math.max(s.point.x, v.point.x) ||
        Math.max(l.point.z, r.point.z) < Math.min(s.point.z, v.point.z) ||
        Math.min(l.point.z, r.point.z) > Math.max(s.point.z, v.point.z)
      )
        continue;
      const hit = segmentIntersection(l.point, r.point, s.point, v.point);
      if (!hit) continue;
      let t =
          l.t + (r.t - l.t) * closestPointOnSegment(hit, l.point, r.point).t,
        u = s.t + (v.t - s.t) * closestPointOnSegment(hit, s.point, v.point).t;
      for (let k = 0; k < C.newtonSteps; k++) {
        const p = curvePoint(a, t),
          q = curvePoint(b, u),
          d = curveTangent(a, t),
          e = curveTangent(b, u),
          dx = q.x - p.x,
          dz = q.z - p.z,
          det = e.x * d.z - d.x * e.z;
        if (Math.abs(det) < Number.EPSILON) break;
        t = Math.max(0, Math.min(1, t + (-dx * e.z + e.x * dz) / det));
        u = Math.max(0, Math.min(1, u + (d.x * dz - d.z * dx) / det));
      }
      const p = curvePoint(a, t);
      if (
        distance(p, curvePoint(b, u)) <= C.intersectionErrorM &&
        !hits.some((h) => distance(h.point, p) <= C.intersectionErrorM)
      )
        hits.push({ point: p, t, u });
    }
  // Tangential endpoint joins may not cross sampled chords.
  for (const [c, d, swap] of [
    [a, b, false],
    [b, a, true],
  ] as const)
    for (const t of [0, 1]) {
      const p = curvePoint(c, t),
        h = projectCurve(p, d);
      if (
        h.distance <= C.intersectionErrorM &&
        !hits.some((v) => distance(v.point, p) <= C.intersectionErrorM)
      )
        hits.push({ point: p, t: swap ? h.t : t, u: swap ? t : h.t });
    }
  return hits.sort((x, y) => x.t - y.t);
}
