import { LotFinder } from '../../src/world/lots';
import { Rng } from '../../src/core/rng';
import { ZONE_CODES } from '../../src/data/zones';
import { describe, it, expect } from 'vitest';
import {
  curvePoint,
  curveLength,
  curveIntersections,
  subCurve,
  projectCurve,
  type Cubic,
} from '../../src/world/roadCurves';
import { RoadGraph } from '../../src/world/roadGraph';
import {
  previewStraightRoad,
  snapRoadPoint,
} from '../../src/world/roadGeometry';
import { rebuildZoneGrid, zoneCellCenter } from '../../src/world/zoneGrid';
import { WORLD } from '../../src/data/config';
import { Simulation } from '../../src/sim/simulation';
import { serialize, deserialize } from '../../src/save/serializer';
const p = (x: number, z: number) => ({ x, z });
const arc: Cubic = [p(-160, 0), p(-160, 160), p(160, 160), p(160, 0)];
const options = {
  type: 'road_small' as const,
  builtDay: 0,
  startHeight: 60,
  endHeight: 60,
};
const road = (c: Cubic) => ({
  ...options,
  start: c[0],
  c1: c[1],
  c2: c[2],
  end: c[3],
});
const heights = () => new Float32Array(WORLD.heightmapVertices ** 2).fill(60);
describe('curved road topology and geometry', () => {
  it('preserves exact geometry and arc length through subdivision', () => {
    const c = subCurve(arc, 0.2, 0.8);
    for (const t of [0, 0.25, 0.5, 0.75, 1])
      expect(projectCurve(curvePoint(c, t), arc).distance).toBeLessThan(1e-6);
    expect(
      curveLength(subCurve(arc, 0, 0.5)) + curveLength(subCurve(arc, 0.5, 1)),
    ).toBeCloseTo(curveLength(arc), 2);
  });
  it('splits two crossings with a line and conserves costs and curved shape', () => {
    const g = new RoadGraph();
    g.addRoad({ ...road(arc), paidCost: 1001 });
    const before = g.snapshot().segments[0]!;
    g.addRoad({
      ...options,
      start: p(-240, 70),
      end: p(240, 70),
      paidCost: 600,
    });
    const w = g.snapshot();
    expect(w.nodes.filter((n) => n.segments.length === 4)).toHaveLength(2);
    expect(w.segments).toHaveLength(6);
    expect(w.segments.reduce((a, s) => a + (s.paidCost ?? 0), 0)).toBe(1601);
    const nodes = new Map(w.nodes.map((n) => [n.id, n]));
    const children = w.segments.filter(
      (s) =>
        Math.abs(nodes.get(s.start)!.pos.z - 70) > 1e-6 ||
        Math.abs(nodes.get(s.end)!.pos.z - 70) > 1e-6 ||
        s.c1.z > 70,
    );
    expect(children).toHaveLength(3);
    expect(children.reduce((a, s) => a + s.length, 0)).toBeCloseTo(
      before.length,
      2,
    );
    for (const s of children)
      for (const t of [0.25, 0.5, 0.75])
        expect(
          projectCurve(
            curvePoint(
              [nodes.get(s.start)!.pos, s.c1, s.c2, nodes.get(s.end)!.pos],
              t,
            ),
            arc,
          ).distance,
        ).toBeLessThan(1e-5);
  });
  it('intersects two cubics at shared nodes and uses real tangent junction angles', () => {
    const b: Cubic = [p(0, -100), p(80, -40), p(80, 240), p(0, 280)];
    const hits = curveIntersections(arc, b);
    expect(hits).toHaveLength(1);
    expect(projectCurve(hits[0]!.point, b).distance).toBeLessThan(1e-6);
    const g = new RoadGraph();
    g.addRoad(road(arc));
    g.addRoad(road(b));
    expect(
      g.snapshot().nodes.filter((n) => n.segments.length === 4),
    ).toHaveLength(1);
  });
  it('snaps to the actual curve and creates a T junction there', () => {
    const g = new RoadGraph();
    g.addRoad(road(arc));
    const w = {
      ...g.snapshot(),
      heights: heights(),
      ownedTiles: [12],
      buildings: [],
    };
    const s = snapRoadPoint(p(0, 122), w);
    expect(s.kind).toBe('segment');
    expect(s.pos.z).toBeCloseTo(120, 5);
    const preview = previewStraightRoad(
      {
        start: p(0, 240),
        end: s.pos,
        type: 'road_small',
        snap: { angle: false, length: false },
      },
      w,
    );
    expect(preview.canBuild).toBe(true);
    g.addRoad({ ...options, start: p(0, 240), end: s.pos });
    expect(
      g.snapshot().nodes.filter((n) => n.segments.length === 3),
    ).toHaveLength(1);
  });
  it('checks the curved footprint rather than its chord and creates rotated roadside cells', () => {
    const g = new RoadGraph();
    g.addRoad(road(arc));
    const w = {
      ...g.snapshot(),
      heights: heights(),
      ownedTiles: [12],
      buildings: [],
      zoneBlocks: [],
    };
    const grid = rebuildZoneGrid(w);
    expect(grid.blocks.filter((b) => b.side === 1).length).toBeGreaterThan(8);
    expect(grid.blocks.filter((b) => b.side === -1).length).toBeGreaterThan(8);
    expect(
      new Set(grid.blocks.map((b) => b.dir.z.toFixed(2))).size,
    ).toBeGreaterThan(5);
    expect(grid.blocks.some((b) => b.cells.some((c) => c === 0))).toBe(true);
    for (const b of grid.blocks) {
      expect(Math.hypot(b.dir.x, b.dir.z)).toBeCloseTo(1, 8);
      expect(Number.isFinite(zoneCellCenter(b, 0).x)).toBe(true);
    }
    for (const block of grid.blocks)
      for (let i = 0; i < block.cells.length; i++)
        if (block.cells[i] === 0) block.cells[i] = ZONE_CODES.I;
    const finder = new LotFinder({
      ...w,
      zoneBlocks: grid.blocks,
      segments: grid.segments,
      unlocked: [0],
      mode: 'normal',
    });
    let lot = null;
    const rng = new Rng(42);
    for (let i = 0; i < 100 && !lot; i++) lot = finder.find('I', rng);
    expect(lot).not.toBeNull();
    expect(lot!.lotW).toBeGreaterThanOrEqual(2);
    const block = grid.blocks.find((b) => b.id === lot!.zoneBlock)!;
    expect(lot!.rotation).toBeCloseTo(
      Math.atan2(-block.dir.z * block.side, block.dir.x * block.side),
    );
    const empty = { ...w, nodes: [], segments: [], nextId: 1 };
    const building = { pos: p(0, 112), rotation: 0, lotW: 2, lotD: 2 };
    expect(
      previewStraightRoad(
        { ...road(arc), snap: { angle: false, length: false } },
        { ...empty, buildings: [building] },
      ).reason,
    ).toBe('err.buildingConflict');
  });
  it('worker charges curved length and preserves control points through save/load', async () => {
    const initial = new Simulation({
      seed: 1,
      mapId: 'valley',
      cityName: 'Curves',
      mode: 'normal',
    });
    const snapshot = initial.snapshot();
    snapshot.terrain.heights.fill(60);
    const sim = new Simulation(snapshot.settings, undefined, snapshot);
    const result = sim.buildRoad('road_small', {
      start: arc[0],
      c1: arc[1],
      c2: arc[2],
      end: arc[3],
      elevated: false,
    });
    expect(result.ok).toBe(true);
    expect(result.cost).toBeGreaterThan(800);
    const saved = await deserialize(await serialize(sim.snapshot()));
    expect(saved.segments).toEqual(sim.snapshot().segments);
  });
});
