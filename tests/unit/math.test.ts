import { expect, it } from 'vitest';
import {
  add,
  subtract,
  scale,
  dot,
  cross,
  distance,
  normalize,
  lerp,
  clamp,
  quadraticBezier,
  cubicBezier,
  bezierPoint,
  bezierLength,
  closestPointOnSegment,
  segmentIntersection,
  closestPointOnBezier,
} from '../../src/core/math';
import type { Bezier } from '../../src/core/math';
const p = (x: number, z: number) => ({ x, z });
it('performs vector operations, including zero vectors and reusable outputs', () => {
  const a = p(3, 4),
    b = p(-1, 2);
  expect(add(a, b)).toEqual(p(2, 6));
  expect(subtract(a, b)).toEqual(p(4, 2));
  expect(scale(a, 2)).toEqual(p(6, 8));
  expect(dot(a, b)).toBe(5);
  expect(cross(a, b)).toBe(10);
  expect(distance(a, p(0, 0))).toBe(5);
  expect(normalize(a).x).toBeCloseTo(0.6);
  expect(normalize(a).z).toBeCloseTo(0.8);
  expect(normalize(p(0, 0))).toEqual(p(0, 0));
  expect(lerp(a, b, 0.5)).toEqual(p(1, 3));
  expect([clamp(-1, 0, 1), clamp(0.5, 0, 1), clamp(2, 0, 1)]).toEqual([
    0, 0.5, 1,
  ]);
  expect(add(a, b, a)).toBe(a);
  expect(a).toEqual(p(2, 6));
  expect(subtract(a, b, a)).toBe(a);
  expect(scale(a, 2, a)).toBe(a);
  expect(normalize(a, a)).toBe(a);
  expect(lerp(a, b, 1, a)).toEqual(b);
});
it('evaluates quadratic/cubic endpoints, midpoints and aliasing outputs', () => {
  const q = [p(0, 0), p(1, 2), p(2, 0)] as const,
    c = [p(0, 0), p(0, 3), p(3, 3), p(3, 0)] as const;
  expect(quadraticBezier(...q, 0.5)).toEqual(p(1, 1));
  expect(cubicBezier(...c, 0.5)).toEqual(p(1.5, 2.25));
  for (const curve of [q, c]) {
    expect(bezierPoint(curve, 0)).toEqual(curve[0]);
    expect(bezierPoint(curve, 1)).toEqual(curve.at(-1));
    const out = p(0, 0);
    expect(bezierPoint(curve, 0.5, out)).toBe(out);
  }
  const out = p(0, 0);
  quadraticBezier(out, p(1, 2), p(2, 0), 0.5, out);
  expect(out).toEqual(p(1, 1));
  cubicBezier(out, p(1, 1), p(1, 1), p(1, 1), 1, out);
  expect(out).toEqual(p(1, 1));
});
it('projects onto segments, endpoints and degenerate segments', () => {
  expect(closestPointOnSegment(p(1, 3), p(0, 0), p(2, 0))).toEqual({
    point: p(1, 0),
    t: 0.5,
    distance: 3,
  });
  expect(closestPointOnSegment(p(-2, 0), p(0, 0), p(2, 0)).t).toBe(0);
  expect(closestPointOnSegment(p(4, 0), p(0, 0), p(2, 0)).t).toBe(1);
  expect(closestPointOnSegment(p(3, 4), p(0, 0), p(0, 0))).toEqual({
    point: p(0, 0),
    t: 0,
    distance: 5,
  });
});
it.each([
  [p(0, 0), p(2, 2), p(0, 2), p(2, 0), p(1, 1)],
  [p(0, 0), p(1, 0), p(1, 0), p(1, 1), p(1, 0)],
  [p(0, 0), p(1, 0), p(2, -1), p(2, 1), null],
  [p(0, 0), p(1, 0), p(-1, -1), p(-1, 1), null],
  [p(0, 0), p(2, 0), p(1, 1), p(1, 2), null],
  [p(0, 0), p(2, 0), p(1, -2), p(1, -1), null],
  [p(0, 0), p(2, 0), p(0, 1), p(2, 1), null],
  [p(0, 0), p(4, 0), p(3, 0), p(1, 0), p(1, 0)],
  [p(4, 0), p(0, 0), p(1, 0), p(3, 0), p(3, 0)],
  [p(0, 0), p(1, 0), p(2, 0), p(3, 0), null],
  [p(1, 0), p(1, 0), p(0, 0), p(2, 0), p(1, 0)],
  [p(1, 1), p(1, 1), p(0, 0), p(2, 0), null],
  [p(0, 0), p(2, 0), p(1, 0), p(1, 0), p(1, 0)],
  [p(0, 0), p(2, 0), p(1, 1), p(1, 1), null],
  [p(0, 0), p(0, 0), p(0, 0), p(0, 0), p(0, 0)],
])('handles segment intersection case %#', (a, b, c, d, expected) =>
  expect(segmentIntersection(a!, b!, c!, d!)).toEqual(expected),
);
it('computes analytic straight, quadratic and closed-curve lengths', () => {
  expect(bezierLength([p(0, 0), p(1, 0), p(2, 0)])).toBe(2);
  expect(bezierLength([p(0, 0), p(1, 0), p(2, 0), p(3, 0)])).toBe(3);
  expect(bezierLength([p(0, 0), p(0, 0), p(0, 0)])).toBe(0);
  const q = [p(0, 0), p(1, 2), p(2, 0)] as const;
  const exact = Math.sqrt(5) + Math.asinh(2) / 2;
  expect(Math.abs(bezierLength(q, 0.001) - exact)).toBeLessThan(0.001);
  const closed = [p(0, 0), p(2, 2), p(-2, 2), p(0, 0)] as const;
  expect(bezierLength(closed, 0.001)).toBeGreaterThan(3);
  const backtracking = [p(0, 0), p(4, 0), p(1, 0)] as const;
  expect(bezierLength(backtracking, 0.001)).toBeCloseTo(25 / 7, 2);
});
it('finds endpoints and interior nearest points on quadratic/cubic curves', () => {
  const q = [p(0, 0), p(1, 2), p(2, 0)] as const;
  const near = closestPointOnBezier(p(1, 3), q);
  expect(near.t).toBeCloseTo(0.5, 5);
  expect(near.distance).toBeCloseTo(2, 5);
  expect(near.point).toEqual(bezierPoint(q, near.t));
  expect(closestPointOnBezier(p(-1, 0), q).t).toBe(0);
  expect(closestPointOnBezier(p(3, 0), q).t).toBe(1);
  expect(
    closestPointOnBezier(p(1, 0), [p(0, 0), p(0, 0), p(0, 0)]).distance,
  ).toBe(1);
  const curves: Bezier[] = [
    [p(0, 0), p(0, 4), p(4, 4), p(4, 0)],
    [p(0, 0), p(4, 4), p(-4, 4), p(0, 0)],
    [p(0, 0), p(4, 0), p(1, 0)],
    [p(0, 0), p(0, 0), p(10, 0)],
  ];
  for (const curve of curves) {
    const target = p(1, 1),
      found = closestPointOnBezier(target, curve, 0.001);
    let brute = Infinity;
    for (let i = 0; i <= 10000; i++)
      brute = Math.min(brute, distance(target, bezierPoint(curve, i / 10000)));
    expect(found.distance).toBeLessThanOrEqual(brute + 0.001);
    expect(found.point).toEqual(bezierPoint(curve, found.t));
  }
});
it('rejects invalid precision and nonfinite curves, and bounds recursion', () => {
  const q = [p(0, 0), p(1, 2), p(2, 0)] as const;
  for (const tolerance of [0, -1, NaN, Infinity])
    expect(() => bezierLength(q, tolerance)).toThrow(RangeError);
  expect(() => bezierLength([p(NaN, 0), p(0, 0), p(1, 0)])).toThrow(RangeError);
  expect(() => bezierLength(q, 1e-40)).toThrow('subdivision limit');
});

it('rejects nonfinite nearest-point query coordinates', () => {
  const curve = [p(0, 0), p(1, 1), p(2, 0)] as const;
  expect(() => closestPointOnBezier(p(NaN, 0), curve)).toThrow(RangeError);
  expect(() => closestPointOnBezier(p(0, Infinity), curve)).toThrow(RangeError);
});
