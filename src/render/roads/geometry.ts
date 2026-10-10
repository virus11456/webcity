import { junctionTrims } from '../../world/roadJunctions';
import { INTERSECTIONS as J } from '../../data/intersections';
import { laneOffsets, roadCrossSection } from '../../world/roadLanes';
import { Color } from 'three';
import { ROAD_MESH as C } from '../../data/roadMesh';
import { ROAD_PALETTE as P } from '../../data/palette';
import { ROADS } from '../../data/roads';
import { sampleRoad, type RoadSample } from '../../world/roadProfile';
import type { RoadNode, RoadSegment } from '../../world/types';
export interface Point {
  x: number;
  y: number;
  z: number;
}
export interface RoadMeshData {
  positions: number[];
  colors: number[];
}
export interface Arm {
  segment: RoadSegment;
  samples: RoadSample[];
  trim: number;
  angle: number;
  width: number;
  walk: number;
}
const colors = new Map<string, Color>();
function rgb(hex: string): Color {
  let c = colors.get(hex);
  if (!c) {
    c = new Color(hex);
    colors.set(hex, c);
  }
  return c;
}
/** One vertex-coloured buffer holds pavement, kerbs and markings without material groups. */
export class Surface {
  readonly data: RoadMeshData = { positions: [], colors: [] };
  triangle(a: Point, b: Point, c: Point, color: string): void {
    const tint = rgb(color);
    if ((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) > 0)
      [b, c] = [c, b];
    for (const p of [a, b, c]) {
      this.data.positions.push(p.x, p.y, p.z);
      this.data.colors.push(tint.r, tint.g, tint.b);
    }
  }
  quad(a: Point, b: Point, c: Point, d: Point, color: string): void {
    this.triangle(a, b, c, color);
    this.triangle(a, c, d, color);
  }
}
function walk(segment: RoadSegment): number {
  return roadCrossSection(segment.type).sidewalk;
}
/** Interpolate by travelled metres so dashed lines retain consistent lengths on curves. */
export function at(samples: RoadSample[], d: number): RoadSample {
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i]!,
      a = samples[i - 1]!;
    if (d <= b.distance) {
      const t = Math.max(0, (d - a.distance) / (b.distance - a.distance || 1));
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        y: a.y + (b.y - a.y) * t,
        distance: d,
      };
    }
  }
  return samples[samples.length - 1]!;
}
export function edge(
  samples: RoadSample[],
  d: number,
  offset: number,
  lift = 0,
): Point {
  const p = at(samples, d),
    a = at(samples, Math.max(0, d - 0.1)),
    b = at(samples, Math.min(samples[samples.length - 1]!.distance, d + 0.1));
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return {
    x: p.x - ((b.z - a.z) / length) * offset,
    y: p.y + C.surfaceLiftM + lift,
    z: p.z + ((b.x - a.x) / length) * offset,
  };
}
/** Build sorted outgoing portals; adjacent segments share these exact trim sections. */
export function roadArms(
  nodes: readonly RoadNode[],
  segments: readonly RoadSegment[],
): Map<number, Arm[]> {
  const byId = new Map(nodes.map((n) => [n.id, n])),
    result = new Map<number, Arm[]>();
  for (const s of segments) {
    const samples = sampleRoad(s, byId.get(s.start)!, byId.get(s.end)!);
    for (const [id, points] of [
      [s.start, samples],
      [
        s.end,
        samples
          .map((p) => ({
            ...p,
            distance: samples[samples.length - 1]!.distance - p.distance,
          }))
          .reverse(),
      ],
    ] as const) {
      const a = points[0]!,
        b = points[1]!;
      const arm: Arm = {
        segment: s,
        samples: points,
        trim: 0,
        angle: Math.atan2(b.z - a.z, b.x - a.x),
        width: ROADS[s.type].widthM / 2,
        walk: walk(s),
      };
      const list = result.get(id) ?? [];
      list.push(arm);
      result.set(id, list);
    }
  }
  for (const arms of result.values()) {
    arms.sort((a, b) => a.angle - b.angle);
    const trims = junctionTrims(
      arms.map((a) => ({
        id: a.segment.id,
        angle: a.angle,
        width: a.width,
        length: a.samples.at(-1)!.distance,
      })),
    );
    for (const a of arms) a.trim = trims.get(a.segment.id)!;
  }
  return result;
}
function strip(
  out: Surface,
  samples: RoadSample[],
  from: number,
  to: number,
  left: number,
  right: number,
  color: string,
  lift = 0,
): void {
  if (to <= from) return;
  const steps = Math.max(1, Math.ceil((to - from) / C.sampleM));
  for (let i = 0; i < steps; i++) {
    const a = from + ((to - from) * i) / steps,
      b = from + ((to - from) * (i + 1)) / steps;
    out.quad(
      edge(samples, a, left, lift),
      edge(samples, b, left, lift),
      edge(samples, b, right, lift),
      edge(samples, a, right, lift),
      color,
    );
  }
}
/** Extrude cross-sections along the cubic road and stop all markings before junction portals. */
export function segmentMesh(
  arm: Arm,
  end: Arm,
  junctionStart: boolean,
  junctionEnd: boolean,
): RoadMeshData {
  const out = new Surface(),
    s = arm.segment,
    def = ROADS[s.type],
    samples = arm.samples;
  const from = arm.trim,
    to = samples[samples.length - 1]!.distance - end.trim,
    half = arm.width,
    inner = half - arm.walk;
  strip(
    out,
    samples,
    from,
    to,
    -inner,
    inner,
    s.type === 'gravel' ? P.gravel : P.asphalt,
  );
  if (arm.walk)
    for (const side of [-1, 1]) {
      strip(
        out,
        samples,
        from,
        to,
        side * (inner + C.curbM),
        side * half,
        P.sidewalk,
        C.curbHeightM,
      );
      strip(
        out,
        samples,
        from,
        to,
        side * inner,
        side * (inner + C.curbM),
        P.curb,
        C.curbHeightM,
      );
      const steps = Math.max(1, Math.ceil((to - from) / C.sampleM));
      for (let i = 0; i < steps; i++) {
        const a = from + ((to - from) * i) / steps,
          b = from + ((to - from) * (i + 1)) / steps;
        out.quad(
          edge(samples, a, side * inner),
          edge(samples, b, side * inner),
          edge(samples, b, side * inner, C.curbHeightM),
          edge(samples, a, side * inner, C.curbHeightM),
          P.curb,
        );
      }
    }
  const section = roadCrossSection(s.type);
  if (section.median) {
    strip(
      out,
      samples,
      from,
      to,
      -section.median / 2,
      section.median / 2,
      P.curb,
      C.curbHeightM,
    );
    strip(
      out,
      samples,
      from,
      to,
      -section.median / 2 + C.curbM,
      section.median / 2 - C.curbM,
      P.median_grass,
      C.curbHeightM + C.markingLiftM,
    );
  }
  if (s.type !== 'gravel') {
    const markedFrom = from + (junctionStart ? J.stopLineOffsetM : 0),
      markedTo = to - (junctionEnd ? J.stopLineOffsetM : 0);
    const lanes = def.lanesForward + def.lanesBackward;
    for (let lane = 1; lane < lanes; lane++) {
      const offset =
        -inner +
        section.laneWidth * lane +
        (lane > def.lanesBackward ? section.median : 0);
      if (def.lanesBackward > 0 && lanes >= 4 && lane === def.lanesBackward) {
        for (const side of [-1, 1])
          strip(
            out,
            samples,
            markedFrom,
            markedTo,
            offset +
              section.median / 2 +
              side * (section.median / 2 + C.doubleLineGapM / 2) -
              C.lineWidthM / 2,
            offset +
              section.median / 2 +
              side * (section.median / 2 + C.doubleLineGapM / 2) +
              C.lineWidthM / 2,
            P.lane_yellow,
            C.markingLiftM,
          );
      } else
        for (
          let d =
            Math.ceil(markedFrom / (C.dashM + C.gapM)) * (C.dashM + C.gapM);
          d < markedTo;
          d += C.dashM + C.gapM
        )
          strip(
            out,
            samples,
            d,
            Math.min(markedTo, d + C.dashM),
            offset - C.lineWidthM / 2,
            offset + C.lineWidthM / 2,
            P.lane_white,
            C.markingLiftM,
          );
    }
    if (def.lanesBackward === 0)
      for (const lane of laneOffsets(s.type))
        for (
          let d = from + C.arrowSpacingM / 2;
          d + C.arrowLengthM < to;
          d += C.arrowSpacingM
        ) {
          strip(
            out,
            samples,
            d,
            d + C.arrowLengthM * 0.65,
            lane.offset - C.lineWidthM,
            lane.offset + C.lineWidthM,
            P.lane_white,
            C.markingLiftM,
          );
          out.triangle(
            edge(
              samples,
              d + C.arrowLengthM * 0.6,
              lane.offset - C.arrowWidthM / 2,
              C.markingLiftM,
            ),
            edge(samples, d + C.arrowLengthM, lane.offset, C.markingLiftM),
            edge(
              samples,
              d + C.arrowLengthM * 0.6,
              lane.offset + C.arrowWidthM / 2,
              C.markingLiftM,
            ),
            P.lane_white,
          );
        }
    for (const start of [true, false]) {
      if (
        !(start ? junctionStart : junctionEnd) ||
        to - from < J.stopLineOffsetM + C.lineWidthM * 2
      )
        continue;
      const near = start ? from : to,
        sign = start ? 1 : -1;
      if (arm.walk)
        for (
          let offset = -inner;
          offset + J.stripeWidthM <= inner;
          offset += J.stripeWidthM + J.stripeGapM
        ) {
          if (Math.abs(offset) < section.median / 2) continue;
          strip(
            out,
            samples,
            Math.min(near + sign, near + sign * (1 + J.crossingDepthM)),
            Math.max(near + sign, near + sign * (1 + J.crossingDepthM)),
            offset,
            offset + J.stripeWidthM,
            P.lane_white,
            C.markingLiftM,
          );
        }
      if (start ? def.lanesBackward > 0 : def.lanesForward > 0) {
        const d = near + sign * J.stopLineOffsetM;
        strip(
          out,
          samples,
          d - C.lineWidthM,
          d + C.lineWidthM,
          start ? -inner : section.median / 2,
          start ? -section.median / 2 : inner,
          P.lane_white,
          C.markingLiftM,
        );
      }
    }
  }
  return out.data;
}
function corner(a: Arm, b: Arm, inner: boolean): Point[] {
  const wa = a.width - (inner ? a.walk : 0),
    wb = b.width - (inner ? b.walk : 0);
  const pa = edge(a.samples, a.trim, wa),
    pb = edge(b.samples, b.trim, -wb);
  const ua = { x: Math.cos(a.angle), z: Math.sin(a.angle) },
    ub = { x: Math.cos(b.angle), z: Math.sin(b.angle) };
  const determinant = ua.x * ub.z - ua.z * ub.x;
  let control = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 };
  if (Math.abs(determinant) > 1e-5) {
    const t = ((pb.x - pa.x) * ub.z - (pb.z - pa.z) * ub.x) / determinant;
    const candidate = { x: pa.x + ua.x * t, z: pa.z + ua.z * t };
    // Acute, very short arms cannot support an unbounded miter.
    if (
      Math.hypot(
        candidate.x - a.samples[0]!.x,
        candidate.z - a.samples[0]!.z,
      ) <=
      Math.max(a.trim, b.trim) + Math.max(wa, wb)
    )
      control = candidate;
  }
  const points: Point[] = [];
  for (let i = 0; i <= C.cornerSteps; i++) {
    const t = i / C.cornerSteps,
      u = 1 - t;
    points.push({
      x: u * u * pa.x + 2 * u * t * control.x + t * t * pb.x,
      z: u * u * pa.z + 2 * u * t * control.z + t * t * pb.z,
      y: pa.y + (pb.y - pa.y) * t,
    });
  }
  return points;
}
/** Fill a single star-shaped junction with rounded corner borders; no overlapping road quads. */
export function junctionMesh(node: RoadNode, arms: Arm[]): RoadMeshData {
  const out = new Surface(),
    center = { ...node.pos, y: node.height + C.surfaceLiftM };
  if (arms.length === 1) {
    const a = arms[0]!,
      inner = a.width - a.walk;
    for (let i = 0; i < C.cornerSteps * 2; i++) {
      const p = (r: number, t: number, lift = 0): Point => ({
        x: node.pos.x + Math.cos(a.angle + Math.PI / 2 + t * Math.PI) * r,
        z: node.pos.z + Math.sin(a.angle + Math.PI / 2 + t * Math.PI) * r,
        y: center.y + lift,
      });
      const t = i / (C.cornerSteps * 2),
        u = (i + 1) / (C.cornerSteps * 2);
      out.triangle(
        center,
        p(inner, t),
        p(inner, u),
        a.segment.type === 'gravel' ? P.gravel : P.asphalt,
      );
      if (a.walk) {
        out.quad(
          p(inner, t, C.curbHeightM),
          p(inner, u, C.curbHeightM),
          p(a.width, u, C.curbHeightM),
          p(a.width, t, C.curbHeightM),
          P.sidewalk,
        );
        out.quad(
          p(inner, t),
          p(inner, u),
          p(inner, u, C.curbHeightM),
          p(inner, t, C.curbHeightM),
          P.curb,
        );
      }
    }
    return out.data;
  }
  if (arms.every((a) => !a.trim)) return out.data;
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i]!,
      b = arms[(i + 1) % arms.length]!;
    out.triangle(
      center,
      edge(a.samples, a.trim, -(a.width - a.walk)),
      edge(a.samples, a.trim, a.width - a.walk),
      a.segment.type === 'gravel' ? P.gravel : P.asphalt,
    );
    const inner = corner(a, b, true),
      outer = corner(a, b, false);
    for (let j = 1; j < inner.length; j++) {
      const p = inner[j - 1]!,
        q = inner[j]!,
        r = outer[j]!,
        s = outer[j - 1]!;
      out.triangle(center, p, q, P.asphalt);
      if (a.walk || b.walk) {
        const up = (p: Point): Point => ({ ...p, y: p.y + C.curbHeightM });
        out.quad(up(p), up(q), up(r), up(s), P.sidewalk);
        out.quad(p, q, up(q), up(p), P.curb);
      }
    }
  }
  return out.data;
}
