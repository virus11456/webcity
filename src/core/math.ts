/** Structural world-plane vector, compatible with world/types without a layer dependency. */
export interface Vec2 {
  x: number;
  z: number;
}
export type Bezier =
  | readonly [Readonly<Vec2>, Readonly<Vec2>, Readonly<Vec2>]
  | readonly [Readonly<Vec2>, Readonly<Vec2>, Readonly<Vec2>, Readonly<Vec2>];
const EPSILON = 1e-10;

/** Clamp a scalar to an inclusive interval. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
/** Add vectors; out may alias either input. */
export function add(
  a: Readonly<Vec2>,
  b: Readonly<Vec2>,
  out: Vec2 = { x: 0, z: 0 },
): Vec2 {
  out.x = a.x + b.x;
  out.z = a.z + b.z;
  return out;
}
/** Subtract vectors; out may alias either input. */
export function subtract(
  a: Readonly<Vec2>,
  b: Readonly<Vec2>,
  out: Vec2 = { x: 0, z: 0 },
): Vec2 {
  out.x = a.x - b.x;
  out.z = a.z - b.z;
  return out;
}
/** Multiply a vector by a scalar. */
export function scale(
  a: Readonly<Vec2>,
  factor: number,
  out: Vec2 = { x: 0, z: 0 },
): Vec2 {
  out.x = a.x * factor;
  out.z = a.z * factor;
  return out;
}
/** Return the scalar dot product. */
export function dot(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return a.x * b.x + a.z * b.z;
}
/** Return the signed 2D cross product. */
export function cross(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return a.x * b.z - a.z * b.x;
}
/** Return Euclidean distance. */
export function distance(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
/** Normalize a vector; zero remains zero. */
export function normalize(a: Readonly<Vec2>, out: Vec2 = { x: 0, z: 0 }): Vec2 {
  const length = Math.hypot(a.x, a.z);
  return scale(a, length === 0 ? 0 : 1 / length, out);
}
/** Interpolate vectors (t may extrapolate). */
export function lerp(
  a: Readonly<Vec2>,
  b: Readonly<Vec2>,
  t: number,
  out: Vec2 = { x: 0, z: 0 },
): Vec2 {
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}
/** Evaluate a quadratic Bézier; reusable output is safe to alias an input. */
export function quadraticBezier(
  a: Readonly<Vec2>,
  b: Readonly<Vec2>,
  c: Readonly<Vec2>,
  t: number,
  out: Vec2 = { x: 0, z: 0 },
): Vec2 {
  const s = 1 - t;
  out.x = s * s * a.x + 2 * s * t * b.x + t * t * c.x;
  out.z = s * s * a.z + 2 * s * t * b.z + t * t * c.z;
  return out;
}
/** Evaluate a cubic Bézier; reusable output is safe to alias an input. */
export function cubicBezier(
  a: Readonly<Vec2>,
  b: Readonly<Vec2>,
  c: Readonly<Vec2>,
  d: Readonly<Vec2>,
  t: number,
  out: Vec2 = { x: 0, z: 0 },
): Vec2 {
  const s = 1 - t;
  out.x =
    s * s * s * a.x +
    3 * s * s * t * b.x +
    3 * s * t * t * c.x +
    t * t * t * d.x;
  out.z =
    s * s * s * a.z +
    3 * s * s * t * b.z +
    3 * s * t * t * c.z +
    t * t * t * d.z;
  return out;
}
/** Evaluate either supported degree. */
export function bezierPoint(curve: Bezier, t: number, out?: Vec2): Vec2 {
  return curve.length === 3
    ? quadraticBezier(curve[0], curve[1], curve[2], t, out)
    : cubicBezier(curve[0], curve[1], curve[2], curve[3], t, out);
}

export interface ClosestPoint {
  point: Vec2;
  t: number;
  distance: number;
}
/** Project onto a closed segment, handling a zero-length segment. */
export function closestPointOnSegment(
  p: Readonly<Vec2>,
  a: Readonly<Vec2>,
  b: Readonly<Vec2>,
): ClosestPoint {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared === 0
      ? 0
      : clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSquared, 0, 1);
  const point = lerp(a, b, t);
  return { point, t, distance: distance(p, point) };
}
/** Return a segment intersection, or the first overlapping point along a→b. */
export function segmentIntersection(
  a: Readonly<Vec2>,
  b: Readonly<Vec2>,
  c: Readonly<Vec2>,
  d: Readonly<Vec2>,
): Vec2 | null {
  const r = subtract(b, a),
    s = subtract(d, c),
    offset = subtract(c, a);
  const rr = dot(r, r),
    ss = dot(s, s);
  if (rr === 0)
    return closestPointOnSegment(a, c, d).distance <= EPSILON ? { ...a } : null;
  if (ss === 0)
    return closestPointOnSegment(c, a, b).distance <= EPSILON ? { ...c } : null;
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= EPSILON * Math.sqrt(rr * ss)) {
    if (Math.abs(cross(offset, r)) > EPSILON * Math.sqrt(rr)) return null;
    const t0 = dot(offset, r) / rr,
      t1 = t0 + dot(s, r) / rr;
    const start = Math.max(0, Math.min(t0, t1)),
      end = Math.min(1, Math.max(t0, t1));
    return start <= end ? lerp(a, b, start) : null;
  }
  const t = cross(offset, s) / denominator,
    u = cross(offset, r) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? lerp(a, b, t) : null;
}

function split(curve: Bezier): [Bezier, Bezier] {
  const ab = lerp(curve[0], curve[1], 0.5),
    bc = lerp(curve[1], curve[2], 0.5),
    abc = lerp(ab, bc, 0.5);
  if (curve.length === 3)
    return [
      [curve[0], ab, abc],
      [abc, bc, curve[2]],
    ];
  const cd = lerp(curve[2], curve[3], 0.5),
    bcd = lerp(bc, cd, 0.5),
    middle = lerp(abc, bcd, 0.5);
  return [
    [curve[0], ab, abc, middle],
    [middle, bcd, cd, curve[3]],
  ];
}
interface CurveSample {
  point: Readonly<Vec2>;
  t: number;
}
function flatten(curve: Bezier, tolerance: number): CurveSample[] {
  if (
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    curve.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))
  )
    throw new RangeError(
      'Curve and tolerance must be finite; tolerance must be positive',
    );
  const result: CurveSample[] = [{ point: curve[0], t: 0 }];
  function visit(
    part: Bezier,
    from: number,
    to: number,
    budget: number,
    depth: number,
  ): void {
    const last = part[part.length - 1]!;
    let polygonLength = 0,
      deviation = 0;
    for (let i = 1; i < part.length; i++) {
      polygonLength += distance(part[i - 1]!, part[i]!);
      deviation = Math.max(
        deviation,
        closestPointOnSegment(part[i]!, part[0], last).distance,
      );
    }
    // Control polygon bounds arc length; convex hull bounds chord deviation.
    if (
      polygonLength - distance(part[0], last) <= budget &&
      deviation <= tolerance
    ) {
      result.push({ point: last, t: to });
      return;
    }
    if (depth === 24)
      throw new RangeError('Curve precision exceeds subdivision limit');
    const [left, right] = split(part),
      middle = (from + to) / 2;
    visit(left, from, middle, budget / 2, depth + 1);
    visit(right, middle, to, budget / 2, depth + 1);
  }
  visit(curve, 0, 1, tolerance, 0);
  return result;
}
/** Approximate arc length with total absolute error bounded by tolerance. */
export function bezierLength(curve: Bezier, tolerance = 0.01): number {
  const samples = flatten(curve, tolerance);
  let length = 0;
  for (let i = 1; i < samples.length; i++)
    length += distance(samples[i - 1]!.point, samples[i]!.point);
  return length;
}
/** Find an approximate closest point on the actual curve; refine every adaptive interval. */
export function closestPointOnBezier(
  p: Readonly<Vec2>,
  curve: Bezier,
  tolerance = 0.01,
): ClosestPoint {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z))
    throw new RangeError('Point must be finite');
  const samples = flatten(curve, tolerance);
  let best: ClosestPoint = {
    point: { ...curve[0] },
    t: 0,
    distance: distance(p, curve[0]),
  };
  const point = { x: 0, z: 0 };
  const consider = (t: number): number => {
    bezierPoint(curve, t, point);
    const value = distance(p, point);
    if (value < best.distance)
      best = { point: { ...point }, t, distance: value };
    return value;
  };
  // Each flat interval is searched separately, including both ends, to handle loops.
  for (let i = 1; i < samples.length; i++) {
    let lo = samples[i - 1]!.t,
      hi = samples[i]!.t;
    consider(hi);
    for (let iteration = 0; iteration < 40; iteration++) {
      const left = lo + (hi - lo) / 3,
        right = hi - (hi - lo) / 3;
      if (consider(left) <= consider(right)) hi = right;
      else lo = left;
    }
    consider((lo + hi) / 2);
  }
  return best;
}
