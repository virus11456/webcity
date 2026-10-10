import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { ROAD_MESH } from '../../src/data/roadMesh';
import { WORLD } from '../../src/data/config';
import { roadBedPatch } from '../../src/world/roadBed';
import { sampleRoad } from '../../src/world/roadProfile';
import {
  junctionMesh,
  roadArms,
  segmentMesh,
} from '../../src/render/roads/geometry';
import { RoadRenderer } from '../../src/render/roads/roadRenderer';
import type { RoadConstructionWorld } from '../../src/world/roadConstruction';
import type { RoadNode, RoadSegment, Vec2 } from '../../src/world/types';
function world(
  points: Vec2[],
  pairs: [number, number][],
): RoadConstructionWorld {
  const nodes: RoadNode[] = points.map((pos, id) => ({
    id,
    pos,
    height: 60,
    segments: [],
    control: 'none',
  }));
  const segments: RoadSegment[] = pairs.map(([start, end], id) => {
    const a = points[start]!,
      b = points[end]!;
    nodes[start]!.segments.push(id);
    nodes[end]!.segments.push(id);
    return {
      id,
      type: 'road_small',
      start,
      end,
      c1: { x: a.x + (b.x - a.x) / 3, z: a.z + (b.z - a.z) / 3 },
      c2: { x: a.x + (2 * (b.x - a.x)) / 3, z: a.z + (2 * (b.z - a.z)) / 3 },
      length: Math.hypot(b.x - a.x, b.z - a.z),
      elevated: false,
      builtDay: 0,
      zoneBlockIds: [],
    };
  });
  return {
    nodes,
    segments,
    heights: new Float32Array(WORLD.heightmapVertices ** 2).fill(65),
    money: 70000,
    mode: 'normal',
    unlocked: [0],
    nextId: 10000,
    ownedTiles: [12],
    buildings: [],
  };
}
function finish(renderer: RoadRenderer) {
  let count = 0;
  while (renderer.readStats().pending && count++ < 10000) renderer.update();
  expect(renderer.readStats().pending).toBe(false);
}
describe('road surfaces', () => {
  for (const angles of [
    [0, 90, 180, 270],
    [0, 90, 180],
    [0, 45, 180],
    [0, 30, 180],
  ])
    it(`fills ${angles.join('/')} degree junction with non-degenerate upward triangles`, () => {
      const w = world(
        [
          { x: 0, z: 0 },
          ...angles.map((a) => ({
            x: 100 * Math.cos((a * Math.PI) / 180),
            z: 100 * Math.sin((a * Math.PI) / 180),
          })),
        ],
        angles.map((_, i) => [0, i + 1]),
      );
      const arms = roadArms(w.nodes, w.segments),
        data = junctionMesh(w.nodes[0]!, arms.get(0)!);
      expect(data.positions.length).toBeGreaterThan(0);
      expect(data.colors.length).toBe(data.positions.length);
      for (let i = 0; i < data.positions.length; i += 9) {
        const p = data.positions.slice(i, i + 9);
        expect(p.every(Number.isFinite)).toBe(true);
        const area =
          (p[3]! - p[0]!) * (p[8]! - p[2]!) - (p[5]! - p[2]!) * (p[6]! - p[0]!);
        expect(area).toBeLessThanOrEqual(1e-8);
      }
      // Every asphalt portal endpoint is shared exactly with the adjoining extrusion.
      for (const arm of arms.get(0)!) {
        const end = arms.get(arm.segment.end)![0]!;
        const strip = segmentMesh(arm, end, true, false);
        let shared = 0;
        for (let i = 0; i < strip.positions.length; i += 3) {
          const p = strip.positions.slice(i, i + 3);
          if (p[1] !== 60 + ROAD_MESH.surfaceLiftM) continue;
          for (let j = 0; j < data.positions.length; j += 3)
            if (
              p.every((v, k) => Math.abs(v - data.positions[j + k]!) < 1e-8)
            ) {
              shared++;
              break;
            }
        }
        expect(shared).toBeGreaterThanOrEqual(2);
      }
    });
  it('samples true cubic curves and interpolates endpoint grade', () => {
    const w = world(
        [
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ],
        [[0, 1]],
      ),
      s = w.segments[0]!;
    s.c1.z = s.c2.z = 80;
    w.nodes[1]!.height = 70;
    const samples = sampleRoad(s, w.nodes[0]!, w.nodes[1]!);
    expect(Math.max(...samples.map((p) => p.z))).toBeCloseTo(60, 1);
    expect(samples.at(-1)!.y).toBe(70);
    expect(samples.at(-1)!.distance).toBeGreaterThan(100);
    const a = roadArms(w.nodes, w.segments);
    expect(
      segmentMesh(a.get(0)![0]!, a.get(1)![0]!, false, false).positions.every(
        Number.isFinite,
      ),
    ).toBe(true);
  });
  it('uses idempotent sparse worker earthworks, including narrow-road supporting triangles', () => {
    const w = world(
      [
        { x: -100, z: 3 },
        { x: 100, z: 3 },
      ],
      [[0, 1]],
    );
    w.segments[0]!.type = 'gravel';
    const before = w.heights.slice();
    const patch = roadBedPatch(w.heights, w.nodes, w.segments);
    expect(w.heights).toEqual(before);
    expect(patch.indices.length).toBeGreaterThan(0);
    expect(patch.indices.length).toBeLessThan(200);
    expect(patch.heights.every((h) => h < 60)).toBe(true);
    patch.indices.forEach((i, k) => (w.heights[i] = patch.heights[k]!));
    expect(roadBedPatch(w.heights, w.nodes, w.segments).indices).toEqual([]);
    w.segments[0]!.elevated = true;
    expect(roadBedPatch(before, w.nodes, w.segments).indices).toEqual([]);
  });
  it('merges 1000 roads to fewer than 30 draw batches and reuses unchanged GPU geometry', () => {
    const points: Vec2[] = [],
      pairs: [number, number][] = [];
    for (let i = 0; i < 1000; i++) {
      const x = -2200 + (i % 40) * 110,
        z = -2200 + Math.floor(i / 40) * 175;
      const n = points.length;
      points.push({ x, z }, { x: x + 80, z });
      pairs.push([n, n + 1]);
    }
    const w = world(points, pairs),
      renderer = new RoadRenderer();
    new Scene().add(renderer.group);
    renderer.sync(w);
    finish(renderer);
    expect(renderer.readStats().batches).toBeLessThan(30);
    expect(renderer.readStats().lamps).toBeGreaterThan(0);
    expect(renderer.readStats().batches + 3).toBeLessThan(30);
    expect(renderer.group.children.length).toBe(
      renderer.readStats().batches + 1,
    );
    const old = [...renderer.group.children];
    renderer.sync(w);
    finish(renderer);
    expect(renderer.group.children).toEqual(old);
    renderer.sync({ ...w, nodes: [], segments: [] });
    finish(renderer);
    expect(renderer.group.children).toHaveLength(0);
    renderer.dispose();
  });
  it('cancels an in-flight rebuild and publishes only the latest road world', () => {
    const w = world(
        [
          { x: 0, z: 0 },
          { x: 200, z: 0 },
        ],
        [[0, 1]],
      ),
      renderer = new RoadRenderer();
    renderer.sync(w);
    renderer.update();
    renderer.sync({ ...w, nodes: [], segments: [] });
    finish(renderer);
    expect(renderer.readStats().batches).toBe(0);
    renderer.dispose();
  });
});
