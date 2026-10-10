import { distance } from '../core/math';
import { ROADS } from '../data/roads';
import { LANE_GRAPH as C } from '../data/laneGraph';
import { curveSamples } from './roadCurves';
import { segmentLanes, type Lane, type LanePoint } from './roadLanes';
import { sampleRoad, type RoadSample } from './roadProfile';
import { junctionTrims } from './roadJunctions';
import type { RoadNode, RoadSegment } from './types';
export type Turn = 'straight' | 'left' | 'right';
export interface LaneConnection {
  id: string;
  node: number;
  from: string;
  to: string;
  turn: Turn;
  length: number;
  speedMps: number;
  points: LanePoint[];
}
interface Profile {
  key: string;
  lanes: Lane[];
  points: RoadSample[];
}
/** Binary-search path interpolation, also usable for vehicle movement. */
export function lanePointAt(
  points: readonly LanePoint[],
  d: number,
): LanePoint {
  if (!points.length) throw new RangeError('Empty lane path');
  const distance = Math.max(0, Math.min(points.at(-1)!.distance, d));
  let lo = 0,
    hi = points.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >>> 1;
    if (points[m]!.distance < distance) lo = m;
    else hi = m;
  }
  const a = points[lo]!,
    b = points[hi]!,
    t = (distance - a.distance) / (b.distance - a.distance || 1);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    distance,
  };
}
function trimLane(
  lane: Lane,
  profile: RoadSample[],
  start: number,
  end: number,
): Lane {
  const at = (d: number) => {
    for (let i = 1; i < profile.length; i++)
      if (d <= profile[i]!.distance) {
        const p = profile[i - 1]!,
          q = profile[i]!,
          t = (d - p.distance) / (q.distance - p.distance || 1);
        const a =
            lane.points[lane.direction === 1 ? i - 1 : profile.length - i]!,
          b = lane.points[lane.direction === 1 ? i : profile.length - i - 1]!;
        return a.distance + (b.distance - a.distance) * t;
      }
    return lane.direction === 1 ? lane.length : 0;
  };
  const a = at(start),
    b = at(profile.at(-1)!.distance - end),
    from = Math.min(a, b),
    to = Math.max(a, b);
  const points = [
    lanePointAt(lane.points, from),
    ...lane.points.filter((p) => p.distance > from && p.distance < to),
    lanePointAt(lane.points, to),
  ].map((p) => ({ ...p, distance: p.distance - from }));
  return { ...lane, points, length: to - from };
}
function direction(lane: Lane, end: boolean) {
  const a = end ? lane.points.at(-2)! : lane.points[0]!,
    b = end ? lane.points.at(-1)! : lane.points[1]!,
    l = distance(a, b) || 1;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}
function turnType(a: Lane, b: Lane): Turn | null {
  const u = direction(a, true),
    v = direction(b, false),
    angle = Math.atan2(u.x * v.z - u.z * v.x, u.x * v.x + u.z * v.z);
  if (Math.abs(angle) >= C.uTurnAngleRadians) return null;
  return Math.abs(angle) <= C.straightAngleRadians
    ? 'straight'
    : angle > 0
      ? 'right'
      : 'left';
}
function connect(node: number, a: Lane, b: Lane, turn: Turn): LaneConnection {
  const p = a.points.at(-1)!,
    q = b.points[0]!,
    u = direction(a, true),
    v = direction(b, false),
    h = distance(p, q) * C.turnHandleRatio;
  const samples = curveSamples([
    p,
    { x: p.x + u.x * h, z: p.z + u.z * h },
    { x: q.x - v.x * h, z: q.z - v.z * h },
    q,
  ]);
  let length = 0;
  const points: LanePoint[] = [];
  for (const s of samples) {
    if (points.length) length += distance(points.at(-1)!, s.point);
    points.push({ ...s.point, y: p.y + (q.y - p.y) * s.t, distance: length });
  }
  return {
    id: `${a.id}>${b.id}`,
    node,
    from: a.id,
    to: b.id,
    turn,
    length,
    speedMps: Math.min(
      a.speedMps,
      b.speedMps,
      turn === 'straight' ? Infinity : C.turnSpeedMps,
    ),
    points,
  };
}
/** Derived Worker-owned graph: unchanged lanes and junction connections retain their identity. */
export class LaneGraph {
  private laneMap = new Map<string, Lane>();
  private profiles = new Map<number, Profile>();
  private segmentKeys = new Map<number, string>();
  private segmentIds = new Map<number, string[]>();
  private nodeKeys = new Map<number, string>();
  private incoming = new Map<number, Set<string>>();
  private outgoing = new Map<number, Set<string>>();
  private byNode = new Map<number, LaneConnection[]>();
  private next = new Map<string, LaneConnection[]>();
  revision = 0;
  get lanes(): ReadonlyMap<string, Lane> {
    return this.laneMap;
  }
  connections(id: string): readonly LaneConnection[] {
    return this.next.get(id) ?? [];
  }
  junction(id: number): readonly LaneConnection[] {
    return this.byNode.get(id) ?? [];
  }
  adjacent(id: string): readonly Lane[] {
    const a = this.laneMap.get(id);
    return a
      ? (this.segmentIds.get(a.segment) ?? [])
          .map((id) => this.laneMap.get(id)!)
          .filter(
            (b) =>
              b.direction === a.direction && Math.abs(a.index - b.index) === 1,
          )
      : [];
  }
  sync(
    nodes: readonly RoadNode[],
    segments: readonly RoadSegment[],
  ): { segments: number; junctions: number } {
    const byNode = new Map(nodes.map((n) => [n.id, n])),
      bySegment = new Map(segments.map((s) => [s.id, s])),
      dirty = new Set<number>();
    for (const s of segments) {
      const a = byNode.get(s.start)!,
        b = byNode.get(s.end)!,
        key = JSON.stringify([
          s.type,
          s.start,
          s.end,
          s.c1,
          s.c2,
          s.length,
          s.elevated,
          a.pos,
          a.height,
          b.pos,
          b.height,
        ]);
      if (this.profiles.get(s.id)?.key !== key)
        this.profiles.set(s.id, {
          key,
          lanes: segmentLanes(s, a, b),
          points: sampleRoad(s, a, b),
        });
    }
    const trims = new Map<number, Map<number, number>>();
    for (const n of nodes) {
      const arms = n.segments.map((id) => {
        const s = bySegment.get(id)!,
          p = this.profiles.get(id)!.points,
          forward = s.start === n.id,
          a = forward ? p[0]! : p.at(-1)!,
          b = forward ? p[1]! : p.at(-2)!;
        return {
          id,
          angle: Math.atan2(b.z - a.z, b.x - a.x),
          width: ROADS[s.type].widthM / 2,
          length: p.at(-1)!.distance,
        };
      });
      trims.set(n.id, junctionTrims(arms));
      const key = JSON.stringify([
        n.pos,
        n.height,
        n.segments,
        n.control,
        n.banLeft,
      ]);
      if (this.nodeKeys.get(n.id) !== key) dirty.add(n.id);
      this.nodeKeys.set(n.id, key);
    }
    for (const id of this.nodeKeys.keys())
      if (!byNode.has(id)) {
        dirty.add(id);
        this.nodeKeys.delete(id);
      }
    let changed = 0;
    const remove = (id: number) => {
      for (const key of this.segmentIds.get(id) ?? []) {
        const lane = this.laneMap.get(key)!;
        dirty.add(lane.start);
        dirty.add(lane.end);
        this.incoming.get(lane.end)?.delete(key);
        this.outgoing.get(lane.start)?.delete(key);
        this.laneMap.delete(key);
        this.next.delete(key);
      }
      this.segmentIds.delete(id);
      this.segmentKeys.delete(id);
    };
    for (const id of this.segmentIds.keys())
      if (!bySegment.has(id)) {
        remove(id);
        this.profiles.delete(id);
        changed++;
      }
    for (const s of segments) {
      const profile = this.profiles.get(s.id)!,
        start = trims.get(s.start)!.get(s.id)!,
        end = trims.get(s.end)!.get(s.id)!,
        key = JSON.stringify([profile.key, start, end]);
      if (this.segmentKeys.get(s.id) === key) continue;
      remove(s.id);
      const lanes = profile.lanes.map((l) =>
        trimLane(l, profile.points, start, end),
      );
      this.segmentIds.set(
        s.id,
        lanes.map((l) => l.id),
      );
      this.segmentKeys.set(s.id, key);
      changed++;
      for (const lane of lanes) {
        this.laneMap.set(lane.id, lane);
        const add = (map: Map<number, Set<string>>, id: number) => {
          const ids = map.get(id) ?? new Set<string>();
          ids.add(lane.id);
          map.set(id, ids);
        };
        add(this.incoming, lane.end);
        add(this.outgoing, lane.start);
        dirty.add(lane.start);
        dirty.add(lane.end);
      }
    }
    for (const id of dirty) {
      for (const c of this.byNode.get(id) ?? []) this.next.delete(c.from);
      this.byNode.delete(id);
      const node = byNode.get(id);
      if (!node) {
        this.incoming.delete(id);
        this.outgoing.delete(id);
        continue;
      }
      const incoming = [...(this.incoming.get(id) ?? [])]
        .map((id) => this.laneMap.get(id)!)
        .sort((a, b) => a.id.localeCompare(b.id));
      const outgoing = [...(this.outgoing.get(id) ?? [])].map((id) =>
        this.laneMap.get(id)!,
      );
      const targets = new Map<number, Lane[]>();
      for (const lane of outgoing) {
        const list = targets.get(lane.segment) ?? [];
        list.push(lane);
        targets.set(lane.segment, list);
      }
      const connections: LaneConnection[] = [];
      for (const a of incoming) {
        const count =
            ROADS[bySegment.get(a.segment)!.type][
              a.direction === 1 ? 'lanesForward' : 'lanesBackward'
            ],
          next: LaneConnection[] = [];
        for (const [segment, list] of [...targets].sort(
          (a, b) => a[0] - b[0],
        )) {
          if (segment === a.segment) continue;
          list.sort((a, b) => a.index - b.index);
          const turn = turnType(a, list[0]!);
          if (
            !turn ||
            (turn === 'left' && (node.banLeft || a.index !== 0)) ||
            (turn === 'right' && a.index !== count - 1)
          )
            continue;
          const index =
            turn === 'left'
              ? 0
              : turn === 'right'
                ? list.length - 1
                : count === 1
                  ? 0
                  : Math.round((a.index * (list.length - 1)) / (count - 1));
          const link = connect(id, a, list[index]!, turn);
          next.push(link);
          connections.push(link);
        }
        this.next.set(a.id, next);
      }
      this.byNode.set(id, connections);
    }
    if (changed || dirty.size) this.revision++;
    return { segments: changed, junctions: dirty.size };
  }
}
