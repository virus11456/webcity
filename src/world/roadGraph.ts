import { MAP_SIZE } from '../data/config';
import { ROAD_GRAPH_PRECISION as PRECISION } from '../data/roadGraph';
import { ROADS, ROAD_RULES, type RoadTypeId } from '../data/roads';
import {
  closestPointOnSegment,
  distance,
  lerp,
  segmentIntersection,
} from '../core/math';
import type { Id, RoadNode, RoadSegment, Vec2 } from './types';

export type RoadGraphErrorCode =
  | 'invalidInput'
  | 'missingNode'
  | 'missingSegment'
  | 'nodeConnected'
  | 'tooShort'
  | 'angleTooSmall'
  | 'overlap';
export class RoadGraphError extends Error {
  constructor(readonly code: RoadGraphErrorCode) {
    super(code);
    this.name = 'RoadGraphError';
  }
}
export interface RoadOptions {
  type: RoadTypeId;
  builtDay: number;
  elevated?: boolean;
}
export interface StraightRoad extends RoadOptions {
  start: Vec2;
  end: Vec2;
  startHeight?: number;
  endHeight?: number;
}
export interface RoadGraphSnapshot {
  nodes: RoadNode[];
  segments: RoadSegment[];
  nextId: Id;
}
/** Same payload shape as the protocol's roadsChanged event. */
export interface RoadGraphChange {
  added: RoadSegment[];
  removed: Id[];
  nodes: RoadNode[];
  removedNodes: Id[];
}
interface GraphData {
  nodes: Map<Id, RoadNode>;
  segments: Map<Id, RoadSegment>;
  nextId: Id;
}

const fail = (code: RoadGraphErrorCode): never => {
  throw new RoadGraphError(code);
};
const heightAt = (a: RoadNode, b: RoadNode, t: number) =>
  a.height * (1 - t) + b.height * t;
const sameHeight = (a: number, b: number) =>
  Math.abs(a - b) <= PRECISION.heightM;
function checkPoint(p: Vec2, height: number): void {
  if (
    !p ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.z) ||
    !Number.isFinite(height) ||
    Math.abs(p.x) > MAP_SIZE / 2 ||
    Math.abs(p.z) > MAP_SIZE / 2
  )
    fail('invalidInput');
}
function allocate(data: GraphData): Id {
  if (!Number.isSafeInteger(data.nextId + 1)) fail('invalidInput');
  return data.nextId++;
}
function ensureNode(data: GraphData, pos: Vec2, height: number): Id {
  for (const node of data.nodes.values())
    if (
      distance(node.pos, pos) <= PRECISION.positionM &&
      sameHeight(node.height, height)
    )
      return node.id;
  const id = allocate(data);
  data.nodes.set(id, {
    id,
    pos: { ...pos },
    height,
    segments: [],
    control: 'none',
  });
  return id;
}
function makeSegment(
  data: GraphData,
  start: Id,
  end: Id,
  options: RoadOptions,
): void {
  const a = data.nodes.get(start)!,
    b = data.nodes.get(end)!;
  const length = distance(a.pos, b.pos);
  if (length + PRECISION.positionM < ROAD_RULES.minSegmentM) fail('tooShort');
  const id = allocate(data);
  data.segments.set(id, {
    id,
    type: options.type,
    start,
    end,
    c1: lerp(a.pos, b.pos, 1 / 3),
    c2: lerp(a.pos, b.pos, 2 / 3),
    length,
    elevated: options.elevated ?? false,
    builtDay: options.builtDay,
    zoneBlockIds: [],
  });
  a.segments.push(id);
  b.segments.push(id);
}
function detach(data: GraphData, id: Id): void {
  const segment = data.segments.get(id)!;
  for (const nodeId of [segment.start, segment.end]) {
    const node = data.nodes.get(nodeId)!;
    node.segments = node.segments.filter((connected) => connected !== id);
  }
  data.segments.delete(id);
}
function sortedNodes(
  data: GraphData,
  ids: Iterable<Id>,
  a: Vec2,
  b: Vec2,
): Id[] {
  return [...new Set(ids)].sort(
    (left, right) =>
      closestPointOnSegment(data.nodes.get(left)!.pos, a, b).t -
      closestPointOnSegment(data.nodes.get(right)!.pos, a, b).t,
  );
}
function split(
  data: GraphData,
  segment: RoadSegment,
  cuts: Iterable<Id>,
): void {
  const a = data.nodes.get(segment.start)!,
    b = data.nodes.get(segment.end)!;
  const ids = sortedNodes(
    data,
    [segment.start, ...cuts, segment.end],
    a.pos,
    b.pos,
  );
  if (ids.length === 2) return;
  detach(data, segment.id);
  for (let i = 1; i < ids.length; i++)
    makeSegment(data, ids[i - 1]!, ids[i]!, segment);
}
function checkJunctions(data: GraphData): void {
  for (const node of data.nodes.values()) {
    const directions = node.segments.map((id) => {
      const segment = data.segments.get(id)!;
      const other = data.nodes.get(
        segment.start === node.id ? segment.end : segment.start,
      )!;
      const length = distance(node.pos, other.pos);
      return {
        x: (other.pos.x - node.pos.x) / length,
        z: (other.pos.z - node.pos.z) / length,
      };
    });
    for (let i = 0; i < directions.length; i++)
      for (let j = i + 1; j < directions.length; j++) {
        const a = directions[i]!,
          b = directions[j]!;
        const angle =
          (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))) * 180) /
          Math.PI;
        if (angle + PRECISION.angleDegrees < ROAD_RULES.minJunctionAngleDegrees)
          fail('angleTooSmall');
      }
    // A crossing / T junction of two four-lane-or-wider roads has at least three wide arms.
    const wideArms = node.segments.filter((id) => {
      const road = ROADS[data.segments.get(id)!.type];
      return (
        road.lanesForward + road.lanesBackward >= ROAD_RULES.signalMinLanes
      );
    }).length;
    node.control = wideArms >= ROAD_RULES.signalMinWideArms ? 'lights' : 'none';
  }
}
/** Positive collinear overlap at a common height, including opposite road direction. */
function overlaps(a: RoadNode, b: RoadNode, c: RoadNode, d: RoadNode): boolean {
  const dx = b.pos.x - a.pos.x,
    dz = b.pos.z - a.pos.z;
  const sx = d.pos.x - c.pos.x,
    sz = d.pos.z - c.pos.z;
  const length = distance(a.pos, b.pos),
    otherLength = distance(c.pos, d.pos);
  if (
    Math.abs(dx * sz - dz * sx) >
    PRECISION.parallelSin * length * otherLength
  )
    return false;
  if (
    Math.abs((c.pos.x - a.pos.x) * dz - (c.pos.z - a.pos.z) * dx) / length >
    PRECISION.positionM
  )
    return false;
  const projection = (p: Vec2) =>
    ((p.x - a.pos.x) * dx + (p.z - a.pos.z) * dz) / (length * length);
  const tc = projection(c.pos),
    td = projection(d.pos);
  const lo = Math.max(0, Math.min(tc, td)),
    hi = Math.min(1, Math.max(tc, td));
  if ((hi - lo) * length <= PRECISION.positionM) return false;
  const gap = (t: number) =>
    heightAt(a, b, t) - heightAt(c, d, (t - tc) / (td - tc));
  const lowGap = gap(lo),
    highGap = gap(hi);
  return (
    Math.abs(lowGap) <= PRECISION.heightM ||
    Math.abs(highGap) <= PRECISION.heightM ||
    Math.sign(lowGap) !== Math.sign(highGap)
  );
}

/** Transactional straight-road topology. Returned values never expose mutable authority. */
export class RoadGraph {
  private data: GraphData;
  /** Dry-run a road on a trusted world snapshot without modifying it or consuming IDs. */
  static previewRoad(
    snapshot: RoadGraphSnapshot,
    road: StraightRoad,
  ): RoadGraphChange {
    const graph = new RoadGraph(snapshot.nextId);
    graph.data = structuredClone({
      nodes: new Map(snapshot.nodes.map((node) => [node.id, node])),
      segments: new Map(
        snapshot.segments.map((segment) => [segment.id, segment]),
      ),
      nextId: snapshot.nextId,
    });
    return graph.addRoad(road);
  }
  constructor(firstId = 1) {
    if (!Number.isSafeInteger(firstId) || firstId <= 0) fail('invalidInput');
    this.data = { nodes: new Map(), segments: new Map(), nextId: firstId };
  }

  /** Export a deterministic defensive snapshot, including the next unused global ID. */
  snapshot(): RoadGraphSnapshot {
    return structuredClone({
      nodes: [...this.data.nodes.values()].sort((a, b) => a.id - b.id),
      segments: [...this.data.segments.values()].sort((a, b) => a.id - b.id),
      nextId: this.data.nextId,
    });
  }
  /** Read a copied node, or undefined for a missing ID. */
  getNode(id: Id): RoadNode | undefined {
    const node = this.data.nodes.get(id);
    return node && structuredClone(node);
  }
  /** Read a copied segment, or undefined for a missing ID. */
  getSegment(id: Id): RoadSegment | undefined {
    const segment = this.data.segments.get(id);
    return segment && structuredClone(segment);
  }
  /** Query incident roads and their opposite endpoint; directions remain in start/end. */
  neighbors(id: Id): { node: RoadNode; segment: RoadSegment }[] {
    const node = this.data.nodes.get(id) ?? fail('missingNode');
    return node.segments.map((segmentId) => {
      const segment = this.data.segments.get(segmentId)!;
      return structuredClone({
        node: this.data.nodes.get(
          segment.start === id ? segment.end : segment.start,
        )!,
        segment,
      });
    });
  }

  /** Add / reuse a node, splitting any same-height straight road under it atomically. */
  addNode(pos: Vec2, height = 0): RoadGraphChange & { nodeId: Id } {
    checkPoint(pos, height);
    let nodeId = 0;
    const change = this.transact((data) => {
      nodeId = ensureNode(data, pos, height);
      const node = data.nodes.get(nodeId)!;
      for (const segment of [...data.segments.values()]) {
        const a = data.nodes.get(segment.start)!,
          b = data.nodes.get(segment.end)!;
        const hit = closestPointOnSegment(node.pos, a.pos, b.pos);
        if (
          hit.distance <= PRECISION.positionM &&
          sameHeight(node.height, heightAt(a, b, hit.t))
        )
          split(data, segment, [nodeId]);
      }
    });
    return { ...change, nodeId };
  }

  /** Insert a node exactly on a segment; endpoints are reused without changing IDs. */
  splitSegment(id: Id, pos: Vec2): RoadGraphChange & { nodeId: Id } {
    checkPoint(pos, 0);
    const segment = this.data.segments.get(id) ?? fail('missingSegment');
    const a = this.data.nodes.get(segment.start)!,
      b = this.data.nodes.get(segment.end)!;
    const hit = closestPointOnSegment(pos, a.pos, b.pos);
    if (hit.distance > PRECISION.positionM) fail('invalidInput');
    return this.addNode(hit.point, heightAt(a, b, hit.t));
  }

  /** Connect existing node IDs, automatically resolving all intermediate crossings. */
  addSegment(start: Id, end: Id, options: RoadOptions): RoadGraphChange {
    const a = this.data.nodes.get(start) ?? fail('missingNode');
    const b = this.data.nodes.get(end) ?? fail('missingNode');
    return this.addRoad({
      ...options,
      start: a.pos,
      end: b.pos,
      startHeight: a.height,
      endHeight: b.height,
    });
  }

  /** Build one straight road, splitting it and every same-height intersected road. */
  addRoad(road: StraightRoad): RoadGraphChange {
    const startHeight = road.startHeight ?? 0,
      endHeight = road.endHeight ?? 0;
    checkPoint(road.start, startHeight);
    checkPoint(road.end, endHeight);
    if (
      !Object.hasOwn(ROADS, road.type) ||
      !Number.isSafeInteger(road.builtDay) ||
      road.builtDay < 0 ||
      (road.elevated !== undefined && typeof road.elevated !== 'boolean')
    )
      fail('invalidInput');
    if (
      distance(road.start, road.end) + PRECISION.positionM <
      ROAD_RULES.minSegmentM
    )
      fail('tooShort');
    return this.transact((data) => {
      const start = ensureNode(data, road.start, startHeight),
        end = ensureNode(data, road.end, endHeight);
      const a = data.nodes.get(start)!,
        b = data.nodes.get(end)!;
      const cuts = new Set<Id>([start, end]);
      // Isolated nodes and existing junctions on the new path must also become connections.
      for (const node of data.nodes.values()) {
        const hit = closestPointOnSegment(node.pos, a.pos, b.pos);
        if (
          hit.distance <= PRECISION.positionM &&
          sameHeight(node.height, heightAt(a, b, hit.t))
        )
          cuts.add(node.id);
      }
      const oldCuts = new Map<Id, Set<Id>>();
      for (const segment of data.segments.values()) {
        const c = data.nodes.get(segment.start)!,
          d = data.nodes.get(segment.end)!;
        if (overlaps(a, b, c, d)) fail('overlap');
        const hit = segmentIntersection(a.pos, b.pos, c.pos, d.pos);
        if (!hit) continue;
        const t = closestPointOnSegment(hit, a.pos, b.pos).t;
        const u = closestPointOnSegment(hit, c.pos, d.pos).t;
        const height = heightAt(a, b, t);
        if (!sameHeight(height, heightAt(c, d, u))) continue;
        const id = ensureNode(data, hit, height);
        cuts.add(id);
        const ids = oldCuts.get(segment.id) ?? new Set<Id>();
        ids.add(id);
        oldCuts.set(segment.id, ids);
      }
      for (const [id, ids] of oldCuts) split(data, data.segments.get(id)!, ids);
      const ids = sortedNodes(data, cuts, a.pos, b.pos);
      for (let i = 1; i < ids.length; i++)
        makeSegment(data, ids[i - 1]!, ids[i]!, road);
    });
  }

  /** Remove a road and prune endpoints that no longer have incident roads. */
  removeSegment(id: Id): RoadGraphChange {
    if (!this.data.segments.has(id)) fail('missingSegment');
    return this.transact((data) => {
      const segment = data.segments.get(id)!;
      detach(data, id);
      for (const endpoint of [segment.start, segment.end])
        if (!data.nodes.get(endpoint)!.segments.length)
          data.nodes.delete(endpoint);
    });
  }
  /** Remove an isolated node; connected nodes must have their roads removed first. */
  removeNode(id: Id): RoadGraphChange {
    const node = this.data.nodes.get(id) ?? fail('missingNode');
    if (node.segments.length) fail('nodeConnected');
    return this.transact((data) => {
      data.nodes.delete(id);
    });
  }

  private transact(operation: (draft: GraphData) => void): RoadGraphChange {
    const before = this.data,
      draft = structuredClone(before);
    operation(draft);
    checkJunctions(draft);
    const change: RoadGraphChange = {
      added: [...draft.segments.values()].filter(
        (s) => !before.segments.has(s.id),
      ),
      removed: [...before.segments.keys()].filter(
        (id) => !draft.segments.has(id),
      ),
      nodes: [...draft.nodes.values()].filter(
        (n) => JSON.stringify(n) !== JSON.stringify(before.nodes.get(n.id)),
      ),
      removedNodes: [...before.nodes.keys()].filter(
        (id) => !draft.nodes.has(id),
      ),
    };
    this.data = draft;
    return structuredClone(change);
  }
}
