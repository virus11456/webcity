import { WorldMirror } from '../../src/bridge/mirror';
import { Simulation } from '../../src/sim/simulation';
import { describe, expect, it } from 'vitest';
import {
  RoadGraph,
  RoadGraphError,
  type RoadGraphErrorCode,
  type StraightRoad,
} from '../../src/world/roadGraph';
import type { Vec2 } from '../../src/world/types';
import { distance, cubicBezier } from '../../src/core/math';
import { ROAD_RULES } from '../../src/data/roads';

const point = (x: number, z: number): Vec2 => ({ x, z });
const road = (
  ax: number,
  az: number,
  bx: number,
  bz: number,
  options: Partial<StraightRoad> = {},
): StraightRoad => ({
  start: point(ax, az),
  end: point(bx, bz),
  type: 'road_small',
  builtDay: 3,
  ...options,
});
function rejectsUnchanged(
  graph: RoadGraph,
  code: RoadGraphErrorCode,
  operation: () => unknown,
) {
  const before = graph.snapshot();
  expect(operation).toThrow(RoadGraphError);
  try {
    operation();
  } catch (error) {
    expect((error as RoadGraphError).code).toBe(code);
  }
  expect(graph.snapshot()).toEqual(before);
}
function invariants(graph: RoadGraph) {
  const { nodes, segments, nextId } = graph.snapshot();
  const ids = [...nodes, ...segments].map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => id < nextId)).toBe(true);
  expect(nodes.reduce((sum, n) => sum + n.segments.length, 0)).toBe(
    segments.length * 2,
  );
  for (const node of nodes) {
    expect(new Set(node.segments).size).toBe(node.segments.length);
    for (const id of node.segments)
      expect([
        graph.getSegment(id)!.start,
        graph.getSegment(id)!.end,
      ]).toContain(node.id);
  }
  for (const segment of segments) {
    const a = graph.getNode(segment.start)!,
      b = graph.getNode(segment.end)!;
    expect(a.segments).toContain(segment.id);
    expect(b.segments).toContain(segment.id);
    expect(segment.length).toBeCloseTo(distance(a.pos, b.pos), 8);
    expect(segment.length + 1e-6).toBeGreaterThanOrEqual(
      ROAD_RULES.minSegmentM,
    );
    for (const t of [0.25, 0.5, 0.75]) {
      const p = cubicBezier(a.pos, segment.c1, segment.c2, b.pos, t);
      expect(p.x).toBeCloseTo(a.pos.x * (1 - t) + b.pos.x * t, 8);
      expect(p.z).toBeCloseTo(a.pos.z * (1 - t) + b.pos.z * t, 8);
    }
  }
}

describe('straight road graph', () => {
  it('represents a straight road as a cubic with deterministic IDs and copied query data', () => {
    const graph = new RoadGraph(20),
      input = road(0, 0, 96, 0);
    const change = graph.addRoad(input);
    expect(change.added).toHaveLength(1);
    expect(change.nodes).toHaveLength(2);
    expect(change.removed).toEqual([]);
    expect(change.added[0]).toMatchObject({
      id: 22,
      start: 20,
      end: 21,
      c1: point(32, 0),
      c2: point(64, 0),
      length: 96,
      builtDay: 3,
    });
    input.start.x = 50;
    change.nodes[0]!.pos.x = 99;
    change.added[0]!.c1.x = 99;
    const snapshot = graph.snapshot();
    snapshot.segments[0]!.zoneBlockIds.push(100);
    const neighbors = graph.neighbors(20);
    neighbors[0]!.node.pos.x = 999;
    expect(graph.getNode(20)!.pos.x).toBe(0);
    expect(graph.getNode(21)!.pos.x).toBe(96);
    expect(graph.getSegment(22)!.c1.x).toBe(32);
    expect(graph.getSegment(22)!.zoneBlockIds).toEqual([]);
    expect(graph.getNode(999)).toBeUndefined();
    expect(graph.getSegment(999)).toBeUndefined();
    invariants(graph);
  });
  it('makes one shared junction and four segments at a cross, with complete change payload', () => {
    const graph = new RoadGraph();
    const old = graph.addRoad(road(-80, 0, 80, 0)).added[0]!;
    const change = graph.addRoad(road(0, -80, 0, 80));
    const snapshot = graph.snapshot();
    expect(snapshot.nodes).toHaveLength(5);
    expect(snapshot.segments).toHaveLength(4);
    const junctions = snapshot.nodes.filter(
      (node) => node.segments.length === 4,
    );
    expect(junctions).toHaveLength(1);
    expect(junctions[0]!.pos).toEqual(point(0, 0));
    expect(graph.neighbors(junctions[0]!.id)).toHaveLength(4);
    expect(change.removed).toEqual([old.id]);
    expect(change.added).toHaveLength(4);
    expect(change.nodes).toHaveLength(5);
    expect(graph.getSegment(old.id)).toBeUndefined();
    invariants(graph);
  });
  it.each([false, true])(
    'connects a T junction when the incoming endpoint is reversed=%s',
    (reverse) => {
      const graph = new RoadGraph();
      graph.addRoad(road(-80, 0, 80, 0));
      graph.addRoad(reverse ? road(0, 80, 0, 0) : road(0, 0, 0, 80));
      expect(graph.snapshot().nodes).toHaveLength(4);
      expect(graph.snapshot().segments).toHaveLength(3);
      expect(
        graph.snapshot().nodes.filter((n) => n.segments.length === 3),
      ).toHaveLength(1);
      invariants(graph);
    },
  );
  it('reuses an existing junction without duplicate nodes or redundant splits', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(-80, 0, 80, 0));
    graph.addRoad(road(0, 0, 0, 80));
    const junction = graph
      .snapshot()
      .nodes.find((n) => n.segments.length === 3)!;
    const change = graph.addRoad(road(0, -80, 0, 0));
    expect(change.removed).toEqual([]);
    expect(change.added).toHaveLength(1);
    expect(graph.getNode(junction.id)!.segments).toHaveLength(4);
    expect(graph.snapshot().nodes).toHaveLength(5);
    invariants(graph);
  });
  it('passes through an existing four-arm junction without splitting its endpoints twice', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(-80, 0, 80, 0));
    graph.addRoad(road(0, -80, 0, 80));
    const junction = graph
      .snapshot()
      .nodes.find((node) => node.segments.length === 4)!;
    const change = graph.addRoad(road(-100, -100, 100, 100));
    expect(change.removed).toEqual([]);
    expect(change.added).toHaveLength(2);
    expect(graph.getNode(junction.id)!.segments).toHaveLength(6);
    expect(graph.snapshot().nodes).toHaveLength(7);
    invariants(graph);
  });
  it('keeps the main-thread mirror consistent through build, split and deletion deltas', () => {
    const graph = new RoadGraph(),
      mirror = new WorldMirror();
    mirror.apply({
      t: 'ready',
      reqId: 1,
      snapshot: new Simulation({
        seed: 20261006,
        mapId: 'valley',
        mode: 'normal',
        cityName: 'Road delta test',
      }).snapshot(),
    });
    const apply = (change: ReturnType<RoadGraph['addRoad']>) => {
      mirror.apply({ t: 'roadsChanged', ...change });
      const snapshot = mirror.readSnapshot()!;
      expect(snapshot.nodes.sort((a, b) => a.id - b.id)).toEqual(
        graph.snapshot().nodes,
      );
      expect(snapshot.segments.sort((a, b) => a.id - b.id)).toEqual(
        graph.snapshot().segments,
      );
    };
    apply(graph.addRoad(road(-80, 0, 80, 0)));
    apply(graph.addRoad(road(0, -80, 0, 80)));
    for (const segment of graph.snapshot().segments)
      apply(graph.removeSegment(segment.id));
    expect(mirror.readSnapshot()!.nodes).toEqual([]);
  });
  it('splits multiple intersected roads and the new road in path order', () => {
    const graph = new RoadGraph();
    for (const x of [-80, 0, 80]) graph.addRoad(road(x, -80, x, 80));
    const change = graph.addRoad(road(-160, 0, 160, 0));
    expect(change.removed).toHaveLength(3);
    expect(change.added).toHaveLength(10);
    expect(
      graph.snapshot().nodes.filter((n) => n.segments.length === 4),
    ).toHaveLength(3);
    invariants(graph);
  });
  it('inserts isolated nodes along a new road and connects existing endpoint IDs', () => {
    const graph = new RoadGraph();
    const a = graph.addNode(point(-80, 0)).nodeId;
    const middle = graph.addNode(point(0, 0)).nodeId;
    const b = graph.addNode(point(80, 0)).nodeId;
    graph.addSegment(a, b, { type: 'gravel', builtDay: 1 });
    expect(graph.snapshot().nodes).toHaveLength(3);
    expect(graph.getNode(middle)!.segments).toHaveLength(2);
    invariants(graph);
  });
  it('splits a segment at an inserted node, preserving one-way direction, date and elevation', () => {
    const graph = new RoadGraph();
    const original = graph.addRoad(
      road(96, 0, 0, 0, {
        type: 'road_small_oneway',
        builtDay: 12,
        elevated: true,
        startHeight: 20,
        endHeight: 8,
      }),
    ).added[0]!;
    const change = graph.splitSegment(original.id, point(48, 0));
    expect(graph.getNode(change.nodeId)!.height).toBe(14);
    expect(change.removed).toEqual([original.id]);
    expect(change.added).toHaveLength(2);
    for (const segment of change.added) {
      expect(segment).toMatchObject({
        type: 'road_small_oneway',
        builtDay: 12,
        elevated: true,
      });
      expect(graph.getNode(segment.start)!.pos.x).toBeGreaterThan(
        graph.getNode(segment.end)!.pos.x,
      );
    }
    const again = graph.splitSegment(change.added[0]!.id, point(48, 0));
    expect(again.nodeId).toBe(change.nodeId);
    expect(again.added).toEqual([]);
    invariants(graph);
  });
  it('addNode on a road cannot leave a disconnected interior node', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(-48, 0, 48, 0));
    const { nodeId, added } = graph.addNode(point(0, 0));
    expect(added).toHaveLength(2);
    expect(graph.getNode(nodeId)!.segments).toHaveLength(2);
    invariants(graph);
  });
  it.each([
    [0, 0, 80, 0],
    [80, 0, 0, 0],
    [32, 0, 112, 0],
    [16, 0, 64, 0],
    [-32, 0, 112, 0],
  ])('rejects collinear overlap %j atomically', (ax, az, bx, bz) => {
    const graph = new RoadGraph();
    graph.addRoad(road(0, 0, 80, 0));
    rejectsUnchanged(graph, 'overlap', () =>
      graph.addRoad(road(ax, az, bx, bz)),
    );
  });
  it('allows a collinear continuation and separated parallel roads', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(0, 0, 80, 0));
    graph.addRoad(road(80, 0, 160, 0));
    graph.addRoad(road(0, 40, 80, 40));
    expect(graph.snapshot().segments).toHaveLength(3);
    invariants(graph);
  });
  it('rejects roads and resulting split fragments shorter than 16 metres', () => {
    const graph = new RoadGraph();
    rejectsUnchanged(graph, 'tooShort', () =>
      graph.addRoad(road(0, 0, 15.99, 0)),
    );
    rejectsUnchanged(graph, 'tooShort', () => graph.addRoad(road(0, 0, 0, 0)));
    const segment = graph.addRoad(road(0, 0, 80, 0)).added[0]!;
    rejectsUnchanged(graph, 'tooShort', () =>
      graph.addRoad(road(8, -80, 8, 80)),
    );
    rejectsUnchanged(graph, 'tooShort', () =>
      graph.splitSegment(segment.id, point(8, 0)),
    );
    graph.splitSegment(segment.id, point(16, 0));
    invariants(graph);
  });
  it('rejects too-close consecutive intersections without committing earlier splits or IDs', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(0, -80, 0, 80));
    graph.addRoad(road(8, -80, 8, 80));
    rejectsUnchanged(graph, 'tooShort', () =>
      graph.addRoad(road(-80, 0, 80, 0)),
    );
    invariants(graph);
  });
  it.each([29.99, 10])('rejects an angle of %i degrees', (angle) => {
    const graph = new RoadGraph();
    graph.addRoad(road(0, 0, 100, 0));
    rejectsUnchanged(graph, 'angleTooSmall', () =>
      graph.addRoad(
        road(
          0,
          0,
          100 * Math.cos((angle * Math.PI) / 180),
          100 * Math.sin((angle * Math.PI) / 180),
        ),
      ),
    );
  });
  it('accepts exactly 30 degrees and rejects acute angles at a crossing', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(0, 0, 100, 0));
    graph.addRoad(road(0, 0, 100 * Math.cos(Math.PI / 6), 50));
    invariants(graph);
    const cross = new RoadGraph();
    cross.addRoad(road(-100, 0, 100, 0));
    rejectsUnchanged(cross, 'angleTooSmall', () =>
      cross.addRoad(road(-100, -20, 100, 20)),
    );
  });
  it('keeps grade-separated crossings and coincident endpoints disconnected', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(-80, 0, 80, 0));
    graph.addRoad(
      road(0, -80, 0, 80, { startHeight: 10, endHeight: 10, elevated: true }),
    );
    expect(graph.snapshot().segments).toHaveLength(2);
    expect(graph.snapshot().nodes).toHaveLength(4);
    graph.addRoad(
      road(80, 0, 160, 0, { startHeight: 10, endHeight: 10, elevated: true }),
    );
    expect(
      graph.snapshot().nodes.filter((n) => n.pos.x === 80 && n.pos.z === 0),
    ).toHaveLength(2);
    invariants(graph);
  });
  it('connects sloped roads at interpolated equal height', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(-80, 0, 80, 0, { startHeight: 0, endHeight: 20 }));
    graph.addRoad(road(0, -80, 0, 80, { startHeight: 10, endHeight: 10 }));
    const junction = graph
      .snapshot()
      .nodes.find((n) => n.segments.length === 4)!;
    expect(junction.height).toBe(10);
    invariants(graph);
  });
  it('allows stacked collinear roads only while their height ranges remain separated', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(0, 0, 80, 0));
    graph.addRoad(road(0, 0, 80, 0, { startHeight: 10, endHeight: 10 }));
    rejectsUnchanged(graph, 'overlap', () =>
      graph.addRoad(road(0, 0, 80, 0, { startHeight: -5, endHeight: 5 })),
    );
    invariants(graph);
  });
  it('applies default lights at wide-road junctions and clears them when junction arms are removed', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(-80, 0, 80, 0, { type: 'road_medium' }));
    graph.addRoad(road(0, 0, 0, 80, { type: 'road_large' }));
    const junction = graph
      .snapshot()
      .nodes.find((n) => n.segments.length === 3)!;
    expect(junction.control).toBe('lights');
    const branch = graph
      .snapshot()
      .segments.find((s) => s.type === 'road_large')!;
    const change = graph.removeSegment(branch.id);
    expect(change.removed).toEqual([branch.id]);
    expect(change.removedNodes).toHaveLength(1);
    expect(graph.getNode(junction.id)!.control).toBe('none');
    invariants(graph);
  });
  it('does not create lights when a small road joins a four-lane road', () => {
    const graph = new RoadGraph();
    graph.addRoad(road(-80, 0, 80, 0, { type: 'road_medium' }));
    graph.addRoad(road(0, 0, 0, 80));
    expect(graph.snapshot().nodes.every((n) => n.control === 'none')).toBe(
      true,
    );
  });
  it('removes roads without dangling adjacency; connected node deletion is rejected', () => {
    const graph = new RoadGraph();
    const change = graph.addRoad(road(0, 0, 80, 0));
    rejectsUnchanged(graph, 'nodeConnected', () =>
      graph.removeNode(change.nodes[0]!.id),
    );
    graph.removeSegment(change.added[0]!.id);
    expect(graph.snapshot().nodes).toEqual([]);
    expect(graph.snapshot().segments).toEqual([]);
    const isolated = graph.addNode(point(0, 0)).nodeId;
    expect(isolated).toBeGreaterThan(change.added[0]!.id);
    graph.removeNode(isolated);
    expect(graph.snapshot().nodes).toEqual([]);
    invariants(graph);
  });
  it('validates missing IDs, coordinates, road options and ID exhaustion without mutation', () => {
    const graph = new RoadGraph();
    rejectsUnchanged(graph, 'missingNode', () =>
      graph.addSegment(1, 2, { type: 'road_small', builtDay: 0 }),
    );
    rejectsUnchanged(graph, 'missingSegment', () => graph.removeSegment(1));
    rejectsUnchanged(graph, 'missingSegment', () =>
      graph.splitSegment(1, point(0, 0)),
    );
    rejectsUnchanged(graph, 'missingNode', () => graph.removeNode(1));
    expect(() => graph.neighbors(1)).toThrow('missingNode');
    for (const p of [point(NaN, 0), point(0, Infinity), point(2401, 0)])
      rejectsUnchanged(graph, 'invalidInput', () => graph.addNode(p));
    rejectsUnchanged(graph, 'invalidInput', () =>
      graph.addNode(point(0, 0), Infinity),
    );
    rejectsUnchanged(graph, 'invalidInput', () =>
      graph.addRoad(road(0, 0, 80, 0, { builtDay: -1 })),
    );
    const segment = graph.addRoad(road(0, 0, 80, 0)).added[0]!;
    rejectsUnchanged(graph, 'invalidInput', () =>
      graph.splitSegment(segment.id, point(40, 1)),
    );
    expect(() => new RoadGraph(0)).toThrow('invalidInput');
    const exhausted = new RoadGraph(Number.MAX_SAFE_INTEGER);
    rejectsUnchanged(exhausted, 'invalidInput', () =>
      exhausted.addNode(point(0, 0)),
    );
  });
  it('merges numerically coincident endpoints without applying the future 8 m UI snapping radius', () => {
    const graph = new RoadGraph();
    const original = graph.addRoad(road(-80, 0, 0, 0));
    graph.addRoad(road(0.0000001, 0, 0, 80));
    const joint = original.added[0]!.end;
    expect(graph.getNode(joint)!.segments).toHaveLength(2);
    const isolated = graph.addNode(point(1, 0));
    expect(isolated.nodeId).not.toBe(joint);
    invariants(graph);
  });
  it('maintains deterministic adjacency through a grid of 100 crossings', () => {
    const build = () => {
      const graph = new RoadGraph();
      for (let z = -180; z <= 180; z += 40)
        graph.addRoad(road(-240, z, 240, z));
      for (let x = -180; x <= 180; x += 40)
        graph.addRoad(road(x, -240, x, 240));
      return graph;
    };
    const a = build(),
      b = build();
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().nodes).toHaveLength(140);
    expect(a.snapshot().segments).toHaveLength(220);
    expect(
      a.snapshot().nodes.filter((n) => n.segments.length === 4),
    ).toHaveLength(100);
    invariants(a);
  });
});
