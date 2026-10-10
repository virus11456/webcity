import { describe, expect, it } from 'vitest';
import { RoadGraph } from '../../src/world/roadGraph';
import { LaneGraph, lanePointAt } from '../../src/world/laneGraph';
import { roadArms } from '../../src/render/roads/geometry';
import { Simulation } from '../../src/sim/simulation';
import { lerp } from '../../src/core/math';
import type { RoadTypeId } from '../../src/data/roads';
function cross(type: RoadTypeId = 'road_medium') {
  const g = new RoadGraph();
  for (const [ax, az, bx, bz] of [
    [-160, 0, 160, 0],
    [0, -160, 0, 160],
  ])
    g.addRoad({
      start: { x: ax!, z: az! },
      end: { x: bx!, z: bz! },
      type,
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
  return g.snapshot();
}
describe('directed lane graph', () => {
  it('gives inner lanes left/straight and outer lanes right/straight at a four-lane crossroad', () => {
    const w = cross(),
      g = new LaneGraph();
    g.sync(w.nodes, w.segments);
    const node = w.nodes.find((n) => n.segments.length === 4)!;
    expect(g.lanes.size).toBe(16);
    const incoming = [...g.lanes.values()].filter((l) => l.end === node.id);
    expect(incoming).toHaveLength(8);
    for (const a of incoming) {
      const turns = g.connections(a.id);
      expect(turns.map((c) => c.turn).sort()).toEqual(
        a.index === 0 ? ['left', 'straight'] : ['right', 'straight'],
      );
      for (const c of turns) {
        const b = g.lanes.get(c.to)!;
        expect(b.start).toBe(a.end);
        expect(b.segment).not.toBe(a.segment);
        expect(c.points[0]).toMatchObject({
          x: a.points.at(-1)!.x,
          z: a.points.at(-1)!.z,
        });
        expect(c.points.at(-1)).toMatchObject({
          x: b.points[0]!.x,
          z: b.points[0]!.z,
        });
        expect(c.length).toBeGreaterThan(0);
        expect(
          c.points.every((p) => Number.isFinite(p.x + p.y + p.z + p.distance)),
        ).toBe(true);
      }
    }
    const west = incoming.filter(
      (l) => w.nodes.find((n) => n.id === l.start)!.pos.x < 0,
    );
    for (const a of west)
      for (const c of g.connections(a.id)) {
        const target = w.nodes.find(
          (n) => n.id === g.lanes.get(c.to)!.end,
        )!.pos;
        if (c.turn === 'left') expect(target.z).toBeLessThan(0);
        if (c.turn === 'right') expect(target.z).toBeGreaterThan(0);
        if (c.turn === 'straight') expect(target.x).toBeGreaterThan(0);
      }
    const arms = roadArms(w.nodes, w.segments);
    for (const a of incoming) {
      const arm = arms.get(node.id)!.find((p) => p.segment.id === a.segment)!;
      expect(Math.hypot(a.points.at(-1)!.x, a.points.at(-1)!.z)).toBeCloseTo(
        Math.hypot(arm.trim, a.offset),
        5,
      );
    }
  });
  it('single lanes permit all three turns while a left-turn ban removes only left links', () => {
    const w = cross('road_small'),
      g = new LaneGraph();
    g.sync(w.nodes, w.segments);
    const n = w.nodes.find((n) => n.segments.length === 4)!;
    const a = [...g.lanes.values()].find((l) => l.end === n.id)!,
      same = g.lanes.get(a.id);
    expect(
      g
        .connections(a.id)
        .map((c) => c.turn)
        .sort(),
    ).toEqual(['left', 'right', 'straight']);
    n.banLeft = true;
    const changes = g.sync(w.nodes, w.segments);
    expect(changes.segments).toBe(0);
    expect(changes.junctions).toBe(1);
    expect(g.lanes.get(a.id)).toBe(same);
    expect(
      g
        .connections(a.id)
        .map((c) => c.turn)
        .sort(),
    ).toEqual(['right', 'straight']);
  });
  it('never creates a reverse lane or reverse entry for one-way streets', () => {
    const w = cross('road_small_oneway'),
      g = new LaneGraph();
    g.sync(w.nodes, w.segments);
    const n = w.nodes.find((n) => n.segments.length === 4)!;
    expect([...g.lanes.values()].every((l) => l.direction === 1)).toBe(true);
    for (const c of g.junction(n.id)) {
      const a = g.lanes.get(c.from)!,
        b = g.lanes.get(c.to)!;
      expect(a.end).toBe(n.id);
      expect(b.start).toBe(n.id);
      expect(a.segment).not.toBe(b.segment);
    }
    for (const l of g.lanes.values())
      for (const b of g.adjacent(l.id)) expect(b.direction).toBe(l.direction);
  });
  it('preserves unrelated lanes and invalidates only affected junctions when upgrading and deleting', () => {
    const w = cross(),
      g = new LaneGraph();
    g.sync(w.nodes, w.segments);
    const revision = g.revision;
    expect(g.sync(w.nodes, w.segments)).toEqual({ segments: 0, junctions: 0 });
    expect(g.revision).toBe(revision);
    const far = {
      ...w.nodes[0]!,
      id: 999,
      pos: { x: 400, z: 400 },
      segments: [],
    };
    w.nodes.push(far);
    g.sync(w.nodes, w.segments);
    const lane = [...g.lanes.values()][0]!,
      before = g.lanes.get(lane.id),
      node = w.nodes.find((n) => n.segments.length === 4)!;
    node.control = 'stop';
    g.sync(w.nodes, w.segments);
    expect(g.lanes.get(lane.id)).toBe(before);
    const road = w.segments.find((s) => s.id === lane.segment)!;
    road.type = 'road_small';
    expect(g.sync(w.nodes, w.segments).segments).toBeGreaterThan(0);
    expect(g.lanes.get(lane.id)).not.toBe(before);
    const deleted = w.segments.filter((s) => s.id !== road.id),
      nodes = w.nodes.map((n) => ({
        ...n,
        segments: n.segments.filter((id) => id !== road.id),
      }));
    g.sync(nodes, deleted);
    expect([...g.lanes.values()].some((l) => l.segment === road.id)).toBe(
      false,
    );
    expect(g.connections(lane.id)).toEqual([]);
    for (const l of g.lanes.values())
      for (const c of g.connections(l.id)) expect(g.lanes.has(c.to)).toBe(true);
  });
  it('keeps grade-separated roads disconnected and maps unequal straight lane counts deterministically', () => {
    const g = new RoadGraph();
    g.addRoad({
      start: { x: -100, z: 0 },
      end: { x: 0, z: 0 },
      type: 'road_medium',
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
    g.addRoad({
      start: { x: 0, z: 0 },
      end: { x: 100, z: 0 },
      type: 'road_small',
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
    g.addRoad({
      start: { x: -50, z: -100 },
      end: { x: -50, z: 100 },
      type: 'highway',
      builtDay: 0,
      startHeight: 72,
      endHeight: 72,
      elevated: true,
    });
    const w = g.snapshot(),
      lanes = new LaneGraph();
    lanes.sync(w.nodes, w.segments);
    expect(w.nodes).toHaveLength(5);
    const n = w.nodes.find((n) => n.segments.length === 2)!;
    expect(lanes.junction(n.id).every((c) => c.turn === 'straight')).toBe(true);
    for (const l of lanes.lanes.values())
      if (l.points[0]!.y === 72)
        expect(lanes.connections(l.id)).toHaveLength(0);
  });
  it('interpolates path distances with endpoint clamping', () => {
    const points = [
      { x: 0, y: 1, z: 0, distance: 0 },
      { x: 4, y: 3, z: 0, distance: 4 },
      { x: 4, y: 5, z: 4, distance: 8 },
    ];
    expect(lanePointAt(points, 2)).toEqual({ x: 2, y: 2, z: 0, distance: 2 });
    expect(lanePointAt(points, -1)).toEqual(points[0]);
    expect(lanePointAt(points, 99)).toEqual(points[2]);
  });
  it('updates the authoritative graph for actual construction, restrictions and demolition', () => {
    const settings = {
        seed: 1,
        mapId: 'valley',
        cityName: 'Lanes',
        mode: 'sandbox' as const,
      },
      initial = new Simulation(settings).snapshot();
    initial.terrain.heights.fill(60);
    const sim = new Simulation(settings, undefined, initial);
    for (const [ax, az, bx, bz] of [
      [-160, 0, 160, 0],
      [0, -160, 0, 160],
    ]) {
      const start = { x: ax!, z: az! },
        end = { x: bx!, z: bz! };
      expect(
        sim.buildRoad('road_small', {
          start,
          end,
          c1: lerp(start, end, 1 / 3),
          c2: lerp(start, end, 2 / 3),
          elevated: false,
        }).ok,
      ).toBe(true);
    }
    const s = sim.snapshot(),
      n = s.nodes.find((n) => n.segments.length === 4)!;
    expect(sim.laneGraph.junction(n.id)).toHaveLength(12);
    sim.setIntersection(n.id, 'lights', true);
    expect(sim.laneGraph.junction(n.id).some((c) => c.turn === 'left')).toBe(
      false,
    );
    expect(
      sim.bulldoze(
        s.segments.map((s) => ({ kind: 'segment' as const, id: s.id })),
      ).ok,
    ).toBe(true);
    expect(sim.laneGraph.lanes.size).toBe(0);
  });
});

it('keeps remote lane objects stable through an unrelated upgrade', () => {
  const w = cross(),
    g = new LaneGraph();
  w.nodes.push(
    {
      id: 1000,
      pos: { x: 400, z: 400 },
      height: 60,
      segments: [1002],
      control: 'none',
    },
    {
      id: 1001,
      pos: { x: 480, z: 400 },
      height: 60,
      segments: [1002],
      control: 'none',
    },
  );
  w.segments.push({
    ...w.segments[0]!,
    id: 1002,
    start: 1000,
    end: 1001,
    c1: { x: 400 + 80 / 3, z: 400 },
    c2: { x: 400 + 160 / 3, z: 400 },
    length: 80,
  });
  g.sync(w.nodes, w.segments);
  const remote = [...g.lanes.values()].find((l) => l.segment === 1002)!;
  w.segments[0]!.type = 'gravel';
  g.sync(w.nodes, w.segments);
  expect(g.lanes.get(remote.id)).toBe(remote);
});
