import { closestPointOnSegment } from '../../core/math';
import { PATHFINDING as C } from '../../data/pathfinding';
import { ROADS } from '../../data/roads';
import { TRAFFIC } from '../../data/simulation';
import {
  LaneGraph,
  lanePointAt,
  type LaneConnection,
} from '../../world/laneGraph';
import type { Lane, LanePoint } from '../../world/roadLanes';
import { sampleRoad } from '../../world/roadProfile';
import type { RoadNode, RoadSegment, Vec2 } from '../../world/types';
import type { SavedRoute } from '../../world/traffic';
import type { Route, RouteLeg } from '../../world/routes';

/** Reused numeric binary heap; no per-relaxation objects. */
class Heap {
  private ids = new Int32Array(256);
  private priorities = new Float64Array(256);
  private costs = new Float64Array(256);
  size = 0;
  poppedCost = 0;
  poppedPriority = 0;
  clear(): void {
    this.size = 0;
  }
  push(id: number, priority: number, cost: number): void {
    if (this.size === this.ids.length) {
      const ids = new Int32Array(this.size * 2),
        priorities = new Float64Array(this.size * 2),
        costs = new Float64Array(this.size * 2);
      ids.set(this.ids);
      priorities.set(this.priorities);
      costs.set(this.costs);
      this.ids = ids;
      this.priorities = priorities;
      this.costs = costs;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (
        this.priorities[p]! < priority - C.costEpsilonSeconds ||
        (Math.abs(this.priorities[p]! - priority) <= C.costEpsilonSeconds &&
          this.costs[p]! >= cost)
      )
        break;
      this.ids[i] = this.ids[p]!;
      this.priorities[i] = this.priorities[p]!;
      this.costs[i] = this.costs[p]!;
      i = p;
    }
    this.ids[i] = id;
    this.priorities[i] = priority;
    this.costs[i] = cost;
  }
  pop(): number {
    const id = this.ids[0]!;
    this.poppedCost = this.costs[0]!;
    this.poppedPriority = this.priorities[0]!;
    const last = --this.size,
      priority = this.priorities[last]!;
    let i = 0;
    while (i * 2 + 1 < last) {
      let c = i * 2 + 1;
      if (
        c + 1 < last &&
        (this.priorities[c + 1]! < this.priorities[c]! - C.costEpsilonSeconds ||
          (Math.abs(this.priorities[c + 1]! - this.priorities[c]!) <=
            C.costEpsilonSeconds &&
            this.costs[c + 1]! > this.costs[c]!))
      )
        c++;
      if (
        this.priorities[c]! > priority + C.costEpsilonSeconds ||
        (Math.abs(this.priorities[c]! - priority) <= C.costEpsilonSeconds &&
          this.costs[c]! <= this.costs[last]!)
      )
        break;
      this.ids[i] = this.ids[c]!;
      this.priorities[i] = this.priorities[c]!;
      this.costs[i] = this.costs[c]!;
      i = c;
    }
    if (last) {
      this.ids[i] = this.ids[last]!;
      this.priorities[i] = priority;
      this.costs[i] = this.costs[last]!;
    }
    return id;
  }
}
interface Position {
  lane: Lane;
  laneNumber: number;
  phase: number;
  distance: number;
  x: number;
  z: number;
}
interface SearchEdge {
  to: number;
  leg: RouteLeg;
  cost: number;
  extra: number;
}
interface SearchGraph {
  base: Map<string, number>;
  positions: Position[];
  edges: SearchEdge[][];
  size: number;
  phaseByLane: (readonly number[])[];
  score: Float64Array;
  stamp: Int32Array;
  parent: Int32Array;
  parentLeg: (RouteLeg | undefined)[];
  target: Float64Array;
  targetStamp: Int32Array;
  heuristic: Float64Array;
  heuristicStamp: Int32Array;
  laneCost: Float64Array;
  landmarks: Float64Array[];
  generation: number;
  heap: Heap;
}
export interface LaneAccess {
  lane: string;
  distance: number;
}
interface Edge {
  to: string;
  connection?: LaneConnection;
  change?: boolean;
}
function line(a: LanePoint, b: LanePoint): LanePoint[] {
  return [
    { ...a, distance: 0 },
    { ...b, distance: Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y) },
  ];
}
/** Road-derived routing graphs. Walking is bidirectional even on one-way streets, never on highways. */
export class Pathfinder {
  private revision = -1;
  get graphRevision(): number {
    return this.graph.revision;
  }
  private readonly walk = new Map<string, Lane>();
  private readonly walkingNext = new Map<string, Edge[]>();
  private readonly cache = new Map<
    string,
    { day: number; route: Route | null }
  >();
  private readonly congestion = new Map<number, number>();
  private readonly profiles = new Map<number, readonly LanePoint[]>();
  private readonly accessIndex = new Map<string, Set<number>>();
  private readonly driveBySegment = new Map<number, Lane[]>();
  private readonly walkBySegment = new Map<number, Lane[]>();
  private readonly legCache = new Map<string, RouteLeg>();
  private maxSpeed = C.walkingSpeedMps as number;
  private readonly roadById = new Map<number, RoadSegment>();
  private readonly accessCache = new Map<string, LaneAccess[]>();
  computations = 0;
  private driving!: SearchGraph;
  private walking!: SearchGraph;
  constructor(private readonly graph: LaneGraph) {}
  sync(nodes: readonly RoadNode[], segments: readonly RoadSegment[]): void {
    if (this.revision === this.graph.revision) return;
    this.revision = this.graph.revision;
    this.profiles.clear();
    this.accessIndex.clear();
    this.driveBySegment.clear();
    this.walkBySegment.clear();
    this.legCache.clear();
    this.maxSpeed = C.walkingSpeedMps;
    for (const lane of this.graph.lanes.values()) {
      const list = this.driveBySegment.get(lane.segment) ?? [];
      list.push(lane);
      this.driveBySegment.set(lane.segment, list);
      this.maxSpeed = Math.max(this.maxSpeed, lane.speedMps);
    }
    this.roadById.clear();
    for (const s of segments) this.roadById.set(s.id, s);
    this.walk.clear();
    this.walkingNext.clear();
    this.cache.clear();
    this.accessCache.clear();
    const byId = new Map(nodes.map((n) => [n.id, n])),
      outgoing = new Map<number, Lane[]>();
    for (const s of segments) {
      const samples = sampleRoad(s, byId.get(s.start)!, byId.get(s.end)!);
      this.profiles.set(s.id, samples);
      if (!s.elevated && ROADS[s.type].zoning !== 'none') {
        const padding =
          ROADS[s.type].widthM / 2 + C.frontageToleranceM + C.maximumSetbackM;
        const minX = Math.floor(
            (Math.min(...samples.map((p) => p.x)) - padding) / C.accessCellM,
          ),
          maxX = Math.floor(
            (Math.max(...samples.map((p) => p.x)) + padding) / C.accessCellM,
          );
        const minZ = Math.floor(
            (Math.min(...samples.map((p) => p.z)) - padding) / C.accessCellM,
          ),
          maxZ = Math.floor(
            (Math.max(...samples.map((p) => p.z)) + padding) / C.accessCellM,
          );
        for (let x = minX; x <= maxX; x++)
          for (let z = minZ; z <= maxZ; z++) {
            const key = `${x},${z}`,
              set = this.accessIndex.get(key) ?? new Set<number>();
            set.add(s.id);
            this.accessIndex.set(key, set);
          }
      }
      if (s.type.startsWith('highway')) continue;
      for (const direction of [1, -1] as const) {
        const points: LanePoint[] = [];
        let length = 0;
        const source = direction === 1 ? samples : [...samples].reverse();
        for (let i = 0; i < source.length; i++) {
          const p = source[i]!,
            a = source[Math.max(0, i - 1)]!,
            b = source[Math.min(source.length - 1, i + 1)]!,
            l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const offset =
            ROADS[s.type].widthM / 2 +
            (s.type === 'gravel' ? C.gravelShoulderM : -C.sidewalkInsetM);
          const q = {
            x: p.x - ((b.z - a.z) / l) * offset,
            z: p.z + ((b.x - a.x) / l) * offset,
            y: p.y,
            distance: 0,
          };
          if (points.length)
            length += Math.hypot(
              q.x - points.at(-1)!.x,
              q.z - points.at(-1)!.z,
              q.y - points.at(-1)!.y,
            );
          q.distance = length;
          points.push(q);
        }
        const lane: Lane = {
          id: `walk:${s.id}:${direction}`,
          segment: s.id,
          direction,
          index: 0,
          start: direction === 1 ? s.start : s.end,
          end: direction === 1 ? s.end : s.start,
          offset: 0,
          width: C.walkWidthM,
          speedMps: C.walkingSpeedMps,
          length,
          points,
        };
        this.walk.set(lane.id, lane);
        const roadLanes = this.walkBySegment.get(s.id) ?? [];
        roadLanes.push(lane);
        this.walkBySegment.set(s.id, roadLanes);
        const list = outgoing.get(lane.start) ?? [];
        list.push(lane);
        outgoing.set(lane.start, list);
      }
    }
    for (const a of this.walk.values())
      this.walkingNext.set(
        a.id,
        (outgoing.get(a.end) ?? []).map((b) => {
          const points = line(a.points.at(-1)!, b.points[0]!);
          return {
            to: b.id,
            connection: {
              id: `${a.id}>${b.id}`,
              node: a.end,
              from: a.id,
              to: b.id,
              turn: 'straight',
              points,
              length: points.at(-1)!.distance,
              speedMps: C.walkingSpeedMps,
            },
          };
        }),
      );
    this.driving = this.buildSearch('drive');
    this.walking = this.buildSearch('walk');
  }
  setCongestion(ratios: ReadonlyMap<number, number>): void {
    let changed = ratios.size !== this.congestion.size;
    for (const [id, value] of ratios) {
      const ratio = Math.max(
        C.congestionMinimumRatio,
        Math.round(Math.min(1, Math.max(0, value)) * C.congestionBuckets) /
          C.congestionBuckets,
      );
      if (this.congestion.get(id) !== ratio) changed = true;
      this.congestion.set(id, ratio);
    }
    for (const id of this.congestion.keys())
      if (!ratios.has(id)) this.congestion.delete(id);
    if (changed) {
      this.cache.clear();
      if (this.driving) {
        for (const list of this.driving.edges)
          for (const edge of list)
            edge.cost = this.edgeTime(edge.leg, 'drive', edge.extra);
        for (const p of this.driving.positions)
          this.driving.laneCost[p.laneNumber] =
            1 / p.lane.speedMps / (this.congestion.get(p.lane.segment) ?? 1);
      }
    }
  }
  private lanes(mode: 'drive' | 'walk'): ReadonlyMap<string, Lane> {
    return mode === 'drive' ? this.graph.lanes : this.walk;
  }
  private edges(id: string, mode: 'drive' | 'walk'): Edge[] {
    return mode === 'walk'
      ? (this.walkingNext.get(id) ?? [])
      : [
          ...this.graph
            .connections(id)
            .map((connection) => ({ to: connection.to, connection })),
          ...this.graph.adjacent(id).map((l) => ({ to: l.id, change: true })),
        ];
  }
  /** Frontage access is limited to the closest ground road, not a nearby disconnected parallel network. */
  access(point: Vec2, mode: 'drive' | 'walk', setback = 0): LaneAccess[] {
    const key = `${mode}:${point.x}:${point.z}:${setback}`;
    const cached = this.accessCache.get(key);
    if (cached) return cached;
    const groups = mode === 'drive' ? this.driveBySegment : this.walkBySegment;
    let best = Infinity,
      selected = 0;
    const candidates =
      this.accessIndex.get(
        `${Math.floor(point.x / C.accessCellM)},${Math.floor(point.z / C.accessCellM)}`,
      ) ?? [];
    for (const id of candidates) {
      const s = this.roadById.get(id)!,
        points = this.profiles.get(id)!;
      let d = Infinity;
      for (let i = 1; i < points.length; i++)
        d = Math.min(
          d,
          closestPointOnSegment(point, points[i - 1]!, points[i]!).distance,
        );
      if (
        d <= ROADS[s.type].widthM / 2 + C.frontageToleranceM + setback &&
        (d < best || (d === best && id < selected))
      ) {
        best = d;
        selected = id;
      }
    }
    const result: LaneAccess[] = [];
    for (const l of groups.get(selected) ?? []) {
      let best = Infinity,
        distance = 0;
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1]!,
          b = l.points[i]!,
          p = closestPointOnSegment(point, a, b);
        if (p.distance < best) {
          best = p.distance;
          distance = a.distance + (b.distance - a.distance) * p.t;
        }
      }
      result.push({ lane: l.id, distance });
    }
    if (this.accessCache.size >= C.cacheEntries)
      this.accessCache.delete(this.accessCache.keys().next().value!);
    this.accessCache.set(key, result);
    return result;
  }
  find(
    from: Vec2,
    to: Vec2,
    mode: 'drive' | 'walk',
    day = 0,
    fromSetback = 0,
    toSetback = 0,
  ): Route | null {
    const key = `${mode}:${from.x},${from.z},${fromSetback}>${to.x},${to.z},${toSetback}`;
    const cached = this.cache.get(key);
    if (cached && day - cached.day < TRAFFIC.pathCacheDays) return cached.route;
    const route = this.between(
      this.access(from, mode, fromSetback),
      this.access(to, mode, toSetback),
      mode,
    );
    if (route && mode === 'walk' && route.legs.length) {
      const legs = [...route.legs],
        a = lanePointAt(legs[0]!.points, legs[0]!.startDistance ?? 0),
        b = lanePointAt(
          legs.at(-1)!.points,
          (legs.at(-1)!.startDistance ?? 0) + legs.at(-1)!.length,
        );
      const start = line({ ...a, ...from }, a),
        end = line(b, { ...b, ...to });
      legs.unshift({
        id: 'access:start',
        kind: 'access',
        segment: 0,
        length: start.at(-1)!.distance,
        speedMps: C.walkingSpeedMps,
        points: start,
      });
      legs.push({
        id: 'access:end',
        kind: 'access',
        segment: 0,
        length: end.at(-1)!.distance,
        speedMps: C.walkingSpeedMps,
        points: end,
      });
      route.legs = legs;
      route.length += start.at(-1)!.distance + end.at(-1)!.distance;
      route.costSeconds +=
        (start.at(-1)!.distance + end.at(-1)!.distance) / C.walkingSpeedMps;
    }
    if (this.cache.size >= C.cacheEntries)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { day, route });
    return route;
  }
  lane(id: string, mode: 'drive' | 'walk'): Lane | undefined {
    return this.lanes(mode).get(id);
  }
  /** Reattach only to a lane physically at the stranded position, including elevation. */
  recover(
    point: { x: number; y: number; z: number },
    mode: 'drive' | 'walk',
    preferred = '',
  ): LaneAccess[] {
    let best = C.recoveryDistanceM * C.recoveryDistanceM;
    let result: LaneAccess | undefined;
    const lanes = this.lanes(mode);
    const inspect = (lane: Lane) => {
      for (let i = 1; i < lane.points.length; i++) {
        const a = lane.points[i - 1]!,
          b = lane.points[i]!;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx +
              (point.y - a.y) * dy +
              (point.z - a.z) * dz) /
              (dx * dx + dy * dy + dz * dz || 1),
          ),
        );
        const d =
          (a.x + dx * t - point.x) ** 2 +
          (a.y + dy * t - point.y) ** 2 +
          (a.z + dz * t - point.z) ** 2;
        if (d <= best) {
          best = d;
          result = {
            lane: lane.id,
            distance: a.distance + (b.distance - a.distance) * t,
          };
        }
      }
    };
    const first = lanes.get(preferred);
    if (first) {
      inspect(first);
      if (result) return [result];
    }
    for (const lane of lanes.values()) inspect(lane);
    return result ? [result] : [];
  }
  restoreRoute(saved: SavedRoute): Route | null {
    const legs: RouteLeg[] = [];
    for (const leg of saved.legs) {
      if (leg.kind === 'access' || leg.kind === 'laneChange') {
        if (!leg.points?.length) return null;
        legs.push({ ...leg, points: leg.points });
        continue;
      }
      if (leg.lane) {
        const lane = this.lanes(saved.mode).get(leg.lane);
        if (!lane || (leg.startDistance ?? 0) + leg.length > lane.length + 1e-4)
          return null;
        legs.push({ ...leg, points: lane.points });
        continue;
      }
      if (!leg.fromLane || !leg.toLane) return null;
      const connection = this.edges(leg.fromLane, saved.mode).find(
        (e) => e.to === leg.toLane,
      )?.connection;
      if (!connection) return null;
      legs.push({ ...leg, points: connection.points });
    }
    return {
      mode: saved.mode,
      revision: this.revision,
      legs,
      length: legs.reduce((n, l) => n + l.length, 0),
      costSeconds: legs.reduce((n, l) => n + this.edgeTime(l, saved.mode), 0),
    };
  }
  private rememberLeg(key: string, leg: RouteLeg): void {
    // Graph edges retain their own references; only reusable partial-leg lookup needs eviction.
    if (this.legCache.size >= C.cacheEntries)
      this.legCache.delete(this.legCache.keys().next().value!);
    this.legCache.set(key, leg);
  }
  private laneLeg(
    lane: Lane,
    from: number,
    to: number,
    mode: 'drive' | 'walk',
  ): RouteLeg {
    const key = `${lane.id}@${from}>${to}`;
    let leg = this.legCache.get(key);
    if (!leg) {
      leg = {
        id: key,
        kind: mode === 'walk' ? 'walk' : 'lane',
        segment: lane.segment,
        lane: lane.id,
        startDistance: from,
        length: to - from,
        speedMps: lane.speedMps,
        points: lane.points,
      };
      this.rememberLeg(key, leg);
    }
    return leg;
  }
  private changeLeg(a: Lane, b: Lane, from: number, to: number): RouteLeg {
    const key = `change:${a.id}@${from}>${b.id}@${to}`;
    let leg = this.legCache.get(key);
    if (leg) return leg;
    const points: LanePoint[] = [];
    const count = Math.max(2, Math.ceil((to - from) / C.laneChangeSampleM));
    let length = 0;
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        d = from + (to - from) * t,
        p = lanePointAt(a.points, d),
        q = lanePointAt(b.points, (d / a.length) * b.length),
        blend = t * t * (3 - 2 * t);
      const point = {
        x: p.x + (q.x - p.x) * blend,
        y: p.y + (q.y - p.y) * blend,
        z: p.z + (q.z - p.z) * blend,
        distance: 0,
      };
      if (points.length) {
        const old = points.at(-1)!;
        length += Math.hypot(point.x - old.x, point.y - old.y, point.z - old.z);
      }
      point.distance = length;
      points.push(point);
    }
    leg = {
      id: key,
      kind: 'laneChange',
      fromLaneDistance: from,
      toLaneDistance: (to / a.length) * b.length,
      segment: a.segment,
      fromLane: a.id,
      toLane: b.id,
      length,
      speedMps: Math.min(a.speedMps, b.speedMps),
      points,
    };
    this.rememberLeg(key, leg);
    return leg;
  }
  private edgeTime(leg: RouteLeg, mode: 'drive' | 'walk', extra = 0): number {
    return (
      leg.length /
        leg.speedMps /
        (mode === 'drive' ? (this.congestion.get(leg.segment) ?? 1) : 1) +
      extra
    );
  }
  private buildSearch(mode: 'drive' | 'walk'): SearchGraph {
    const lanes = this.lanes(mode),
      phaseByLane: (readonly number[])[] = [];
    const base = new Map<string, number>(),
      positions: Position[] = [],
      edges: SearchEdge[][] = [];
    let laneNumber = 0;
    for (const lane of lanes.values()) {
      base.set(lane.id, positions.length);
      const phases: readonly number[] =
        mode === 'walk' || !this.graph.adjacent(lane.id).length
          ? [0, 1]
          : C.drivingPhases;
      phaseByLane.push(phases);
      for (let phase = 0; phase < phases.length; phase++) {
        const fraction = phases[phase]!;
        const distance = fraction * lane.length,
          p = lanePointAt(lane.points, distance);
        positions.push({ lane, laneNumber, phase, distance, x: p.x, z: p.z });
        edges.push([]);
      }
      laneNumber++;
    }
    const size = positions.length,
      capacity = size + 16;
    const graph: SearchGraph = {
      base,
      positions,
      edges,
      size,
      phaseByLane,
      score: new Float64Array(capacity),
      stamp: new Int32Array(capacity),
      parent: new Int32Array(capacity),
      parentLeg: new Array(capacity),
      target: new Float64Array(lanes.size),
      targetStamp: new Int32Array(lanes.size),
      heuristic: new Float64Array(capacity),
      heuristicStamp: new Int32Array(capacity),
      laneCost: new Float64Array(lanes.size),
      landmarks: [],
      generation: 0,
      heap: new Heap(),
    };
    for (let id = 0; id < size; id++) {
      const p = positions[id]!,
        phase = p.phase,
        phases = phaseByLane[p.laneNumber]!;
      graph.laneCost[p.laneNumber] =
        1 /
        p.lane.speedMps /
        (mode === 'drive' ? (this.congestion.get(p.lane.segment) ?? 1) : 1);
      const add = (to: number, leg: RouteLeg, extra = 0) =>
        edges[id]!.push({
          to,
          leg,
          extra,
          cost: this.edgeTime(leg, mode, extra),
        });
      if (phase < phases.length - 1) {
        const distance = positions[id + 1]!.distance;
        add(id + 1, this.laneLeg(p.lane, p.distance, distance, mode));
        if (
          mode === 'drive' &&
          phases[phase]! >= C.laneChangeStartFraction &&
          phases[phase + 1]! <= C.laneChangeEndFraction &&
          distance - p.distance >= C.minimumLaneChangeM
        )
          for (const other of this.graph.adjacent(p.lane.id))
            add(
              base.get(other.id)! + phase + 1,
              this.changeLeg(p.lane, other, p.distance, distance),
              C.laneChangePenaltySeconds,
            );
      } else
        for (const edge of this.edges(p.lane.id, mode)) {
          if (!edge.connection) continue;
          const connection = edge.connection,
            lane = lanes.get(edge.to)!;
          add(base.get(lane.id)!, {
            id: connection.id,
            kind: mode === 'walk' ? 'walk' : 'junction',
            segment: lane.segment,
            node: connection.node,
            fromLane: connection.from,
            toLane: connection.to,
            length: connection.length,
            speedMps: connection.speedMps,
            points: connection.points,
          });
        }
    }
    if (size >= C.landmarkMinimumVertices) {
      const selected = new Set<number>();
      for (const [dx, dz] of C.landmarkDirections) {
        let best = -Infinity,
          id = 0;
        for (let i = 0; i < size; i++) {
          const p = positions[i]!,
            value = p.x * dx! + p.z * dz!;
          if (value > best) {
            best = value;
            id = i;
          }
        }
        selected.add(id);
      }
      for (const start of selected) {
        const distances = new Float64Array(capacity).fill(Infinity),
          heap = graph.heap;
        heap.clear();
        distances[start] = 0;
        heap.push(start, 0, 0);
        while (heap.size) {
          const id = heap.pop(),
            cost = heap.poppedCost;
          if (cost !== distances[id]) continue;
          for (const edge of edges[id]!) {
            const candidate =
              cost + edge.leg.length / edge.leg.speedMps + edge.extra;
            if (candidate < distances[edge.to]!) {
              distances[edge.to] = candidate;
              heap.push(edge.to, candidate, candidate);
            }
          }
        }
        graph.landmarks.push(distances);
      }
    }
    return graph;
  }
  /** A* uses reusable numeric workspaces; lane-change phases are cached with the road graph. */
  between(
    starts: readonly LaneAccess[],
    goals: readonly LaneAccess[],
    mode: 'drive' | 'walk' = 'drive',
  ): Route | null {
    this.computations++;
    const graph = mode === 'drive' ? this.driving : this.walking;
    if (!graph || !starts.length || starts.length > 16 || !goals.length)
      return null;
    const {
      positions,
      edges,
      score,
      stamp,
      parent,
      parentLeg,
      target,
      targetStamp,
      heap,
    } = graph;
    if (++graph.generation === 2147483647) {
      graph.generation = 1;
      stamp.fill(0);
      targetStamp.fill(0);
      graph.heuristicStamp.fill(0);
    }
    const generation = graph.generation,
      goalPoints: LanePoint[] = [];
    for (const g of goals) {
      const base = graph.base.get(g.lane);
      if (base === undefined) continue;
      const p = positions[base]!;
      target[p.laneNumber] = g.distance;
      targetStamp[p.laneNumber] = generation;
      goalPoints.push(lanePointAt(p.lane.points, g.distance));
    }
    if (!goalPoints.length) return null;
    const landmarkAt = (
      values: Float64Array,
      base: number,
      distance: number,
    ) => {
      const lane = positions[base]!.lane,
        phases = graph.phaseByLane[positions[base]!.laneNumber]!;
      let best = Infinity;
      for (
        let phase = 0;
        phase < phases.length && phases[phase]! * lane.length <= distance;
        phase++
      )
        best = Math.min(
          best,
          values[base + phase]! +
            (distance - phases[phase]! * lane.length) / lane.speedMps,
        );
      return best;
    };
    const landmarkTargets = graph.landmarks.map((values) => {
      let best = Infinity;
      for (const goal of goals) {
        const base = graph.base.get(goal.lane);
        if (base !== undefined)
          best = Math.min(best, landmarkAt(values, base, goal.distance));
      }
      return best;
    });
    const maxSpeed = mode === 'walk' ? C.walkingSpeedMps : this.maxSpeed;
    const heuristic = (id: number) => {
      if (graph.heuristicStamp[id] === generation) return graph.heuristic[id]!;
      const p = positions[id]!;
      let best = Infinity;
      for (const q of goalPoints) {
        const dx = p.x - q.x,
          dz = p.z - q.z;
        best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
      }
      let result = best / maxSpeed;
      for (let l = 0; l < graph.landmarks.length; l++) {
        const bound = landmarkTargets[l]! - graph.landmarks[l]![id]!;
        if (Number.isFinite(bound)) result = Math.max(result, bound);
      }
      graph.heuristic[id] = result;
      graph.heuristicStamp[id] = generation;
      return result;
    };
    heap.clear();
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i]!,
        base = graph.base.get(start.lane);
      if (base === undefined) continue;
      const lane = positions[base]!.lane,
        distance = Math.max(0, Math.min(lane.length, start.distance)),
        point = lanePointAt(lane.points, distance),
        id = graph.size + i;
      const p: Position = {
        lane,
        laneNumber: positions[base]!.laneNumber,
        phase: -1,
        distance,
        x: point.x,
        z: point.z,
      };
      positions[id] = p;
      for (const values of graph.landmarks)
        values[id] = landmarkAt(values, base, distance);
      edges[id] = [];
      const add = (to: number, leg: RouteLeg, extra = 0) =>
        edges[id]!.push({
          to,
          leg,
          extra,
          cost: this.edgeTime(leg, mode, extra),
        });
      const phases = graph.phaseByLane[p.laneNumber]!;
      const next = phases.findIndex((f) => f * lane.length > distance + 1e-6);
      if (next >= 0) {
        const end = phases[next]! * lane.length;
        add(base + next, this.laneLeg(lane, distance, end, mode));
        if (
          mode === 'drive' &&
          distance >= lane.length * C.laneChangeStartFraction &&
          phases[next]! <= C.laneChangeEndFraction &&
          end - distance >= C.minimumLaneChangeM
        )
          for (const other of this.graph.adjacent(lane.id))
            add(
              graph.base.get(other.id)! + next,
              this.changeLeg(lane, other, distance, end),
              C.laneChangePenaltySeconds,
            );
      } else edges[id] = edges[base + phases.length - 1]!;
      stamp[id] = generation;
      score[id] = 0;
      parent[id] = -1;
      heap.push(id, heuristic(id), 0);
    }
    let finish = -1,
      best = Infinity,
      visits = 0;
    while (heap.size && visits < C.maximumVisited) {
      const id = heap.pop(),
        cost = heap.poppedCost;
      if (cost !== score[id]) continue;
      if (heap.poppedPriority >= best - C.costEpsilonSeconds) break;
      visits++;
      const p = positions[id]!,
        distance = target[p.laneNumber]!;
      if (targetStamp[p.laneNumber] === generation && distance >= p.distance) {
        const candidate =
          cost + (distance - p.distance) * graph.laneCost[p.laneNumber]!;
        if (candidate < best) {
          best = candidate;
          finish = id;
        }
      }
      for (const edge of edges[id]!) {
        const to = edge.to,
          candidate = cost + edge.cost;
        if (stamp[to] === generation && candidate >= score[to]!) continue;
        stamp[to] = generation;
        score[to] = candidate;
        parent[to] = id;
        parentLeg[to] = edge.leg;
        heap.push(to, candidate + heuristic(to), candidate);
      }
    }
    if (finish < 0) return null;
    const final = positions[finish]!,
      legs: RouteLeg[] = [
        this.laneLeg(
          final.lane,
          final.distance,
          target[final.laneNumber]!,
          mode,
        ),
      ];
    let id = finish;
    while (parent[id] !== -1) {
      legs.push(parentLeg[id]!);
      id = parent[id]!;
    }
    legs.reverse();
    return {
      revision: this.revision,
      mode,
      legs,
      length: legs.reduce((sum, leg) => sum + leg.length, 0),
      costSeconds: best,
    };
  }
}
