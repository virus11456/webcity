import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/data/config';
import { ZONE_CODES } from '../../src/data/zones';
import { type RoadTypeId } from '../../src/data/roads';
import { lerp } from '../../src/core/math';
import { meshHeightAt } from '../../src/world/heightField';
import {
  rebuildZoneGrid,
  zoneCellCenter,
  zoneCellPolygon,
  type ZoneGridWorld,
} from '../../src/world/zoneGrid';
import {
  zonePolygonsOverlap,
  zoneTerrainValid,
} from '../../src/world/zoneGeometry';
import type {
  Building,
  RoadSegment,
  Vec2,
  ZoneBlock,
} from '../../src/world/types';
const p = (x: number, z: number): Vec2 => ({ x, z });
function empty(): ZoneGridWorld {
  return {
    nodes: [],
    segments: [],
    heights: new Float32Array(WORLD.heightmapVertices ** 2).fill(60),
    buildings: [],
    zoneBlocks: [],
    nextId: 1,
  };
}
function road(
  w: ZoneGridWorld,
  a: Vec2,
  b: Vec2,
  type: RoadTypeId = 'road_small',
  builtDay = 0,
): ZoneGridWorld {
  const id = w.nextId,
    start = id + 1,
    end = id + 2;
  return {
    ...w,
    nextId: id + 3,
    nodes: [
      ...w.nodes,
      { id: start, pos: a, height: 60, segments: [id], control: 'none' },
      { id: end, pos: b, height: 60, segments: [id], control: 'none' },
    ],
    segments: [
      ...w.segments,
      {
        id,
        start,
        end,
        type,
        builtDay,
        c1: lerp(a, b, 1 / 3),
        c2: lerp(a, b, 2 / 3),
        length: Math.hypot(b.x - a.x, b.z - a.z),
        elevated: false,
        zoneBlockIds: [],
      },
    ],
  };
}
function sync(w: ZoneGridWorld): ZoneGridWorld {
  const result = rebuildZoneGrid(w);
  return {
    ...w,
    segments: result.segments,
    zoneBlocks: result.blocks,
    nextId: result.nextId,
  };
}
function cells(blocks: readonly ZoneBlock[]) {
  return blocks.flatMap((block) =>
    Array.from(block.cells, (code, index) => ({
      block,
      index,
      code,
      center: zoneCellCenter(block, index),
      polygon: zoneCellPolygon(block, index),
    })),
  );
}
const valid = (blocks: readonly ZoneBlock[]) =>
  cells(blocks).filter((c) => c.code !== ZONE_CODES.invalid);
function building(pos: Vec2, rotation = 0): Building {
  return {
    id: 900,
    kind: 'service',
    defId: 'park',
    level: 1,
    pos,
    rotation,
    lotW: 1,
    lotD: 1,
    seed: 1,
    state: 'active',
    stateTimer: 0,
    flags: 0,
    problemTimers: {},
    households: 0,
    residents: 0,
    jobs: 0,
    workers: 0,
  } as Building;
}
describe('road-owned zoning grid', () => {
  it('creates 8m cells, four rows on each side, deterministic IDs and segment ownership', () => {
    const w = road(empty(), p(-80, 0), p(80, 0)),
      before = structuredClone(w),
      r = rebuildZoneGrid(w);
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks.map((b) => b.width)).toEqual([20, 20]);
    expect(r.blocks.map((b) => b.cells.length)).toEqual([80, 80]);
    expect(r.blocks.every((b) => b.buildingAt.every((id) => id === -1))).toBe(
      true,
    );
    expect(r.segments[0]!.zoneBlockIds).toEqual(r.blocks.map((b) => b.id));
    expect(valid(r.blocks).length).toBeGreaterThan(140);
    expect(w).toEqual(before);
    expect(rebuildZoneGrid(w)).toEqual(r);
    const stable = rebuildZoneGrid({
      ...w,
      zoneBlocks: r.blocks,
      segments: r.segments,
      nextId: r.nextId,
    });
    expect(stable).toEqual(r);
    const b = r.blocks.find((b) => b.side === 1)!;
    expect(zoneCellCenter(b, 0)).toEqual(p(-76, 12));
    expect(zoneCellCenter(b, b.width)).toEqual(p(-76, 20));
  });
  it('leaves remainder metres unused instead of extending past the road endpoint', () => {
    const r = rebuildZoneGrid(road(empty(), p(0, 0), p(83, 0)));
    expect(r.blocks.every((b) => b.width === 10)).toBe(true);
    expect(
      Math.max(...cells(r.blocks).flatMap((c) => c.polygon.map((p) => p.x))),
    ).toBe(80);
  });
  it('rotates both sides with the road and treats touching cell edges as legal', () => {
    const r = rebuildZoneGrid(road(empty(), p(0, 0), p(80, 80))),
      b = r.blocks[0]!;
    expect(b.dir.x).toBeCloseTo(Math.SQRT1_2);
    expect(b.dir.z).toBeCloseTo(Math.SQRT1_2);
    expect(
      zonePolygonsOverlap(zoneCellPolygon(b, 2), zoneCellPolygon(b, 3)),
    ).toBe(false);
  });
  it('gives older parallel-road blocks priority without overlapping valid interiors', () => {
    let w = sync(road(empty(), p(-80, 0), p(80, 0)));
    const originalIds = w.zoneBlocks.map((b) => b.id);
    const oldestId = w.segments[0]!.id;
    w = road(w, p(-80, 48), p(80, 48));
    const result = rebuildZoneGrid(w),
      available = valid(result.blocks);
    const middle = available.filter(
      (c) => c.center.x === 4 && c.center.z > 8 && c.center.z < 40,
    );
    expect(middle.every((c) => c.block.segment === oldestId)).toBe(true);
    expect(
      result.blocks.filter((b) => b.segment === oldestId).map((b) => b.id),
    ).toEqual(originalIds);
    for (let i = 0; i < available.length; i++)
      for (let j = i + 1; j < available.length; j++)
        expect(
          zonePolygonsOverlap(available[i]!.polygon, available[j]!.polygon),
        ).toBe(false);
    expect(
      rebuildZoneGrid({
        ...w,
        segments: [...w.segments].reverse(),
        nodes: [...w.nodes].reverse(),
      }),
    ).toMatchObject({ blocks: result.blocks, nextId: result.nextId });
  });
  it('clips full cells at crossing roads and road-width changes rather than just checking centres', () => {
    const w = road(
      road(empty(), p(-80, 0), p(80, 0)),
      p(0, -80),
      p(0, 80),
      'road_medium',
    );
    const r = rebuildZoneGrid(w);
    const first = r.blocks.filter((b) => b.segment === w.segments[0]!.id);
    expect(
      cells(first)
        .filter((c) => Math.abs(c.center.x) < 16)
        .every((c) => c.code === 255),
    ).toBe(true);
    expect(valid(first).some((c) => Math.abs(c.center.x) > 24)).toBe(true);
  });
  it('excludes highways, ramps and elevated roads from block creation', () => {
    for (const type of ['highway', 'highway_ramp'] as const)
      expect(
        rebuildZoneGrid(road(empty(), p(0, 0), p(80, 0), type)).blocks,
      ).toEqual([]);
    const w = road(empty(), p(0, 0), p(80, 0));
    w.segments[0]!.elevated = true;
    expect(rebuildZoneGrid(w).blocks).toEqual([]);
    expect(
      rebuildZoneGrid(road(empty(), p(0, 0), p(80, 0), 'gravel')).blocks,
    ).toHaveLength(2);
  });
  it('creates independently rotated columns along a cubic curve and rejects cell overlaps', () => {
    const w = road(empty(), p(-80, 0), p(80, 0));
    w.segments[0]!.c1.z = w.segments[0]!.c2.z = 60;
    const r = rebuildZoneGrid(w);
    expect(r.blocks.length).toBeGreaterThan(2);
    expect(r.blocks.every((b) => b.width === 1)).toBe(true);
    expect(
      new Set(r.blocks.map((b) => b.dir.z.toFixed(2))).size,
    ).toBeGreaterThan(4);
    expect(valid(r.blocks).length).toBeGreaterThan(0);
    const available = valid(r.blocks);
    for (let i = 0; i < available.length; i++)
      for (let j = i + 1; j < available.length; j++)
        expect(
          zonePolygonsOverlap(available[i]!.polygon, available[j]!.polygon),
        ).toBe(false);
  });
  it('removes deleted-road blocks and reclaims cells previously blocked by that road', () => {
    let w = sync(road(road(empty(), p(-80, 0), p(80, 0)), p(0, -80), p(0, 80)));
    const removedRoad = w.segments[1]!,
      kept = w.segments[0]!;
    const before = valid(
      w.zoneBlocks.filter((b) => b.segment === kept.id),
    ).length;
    const result = rebuildZoneGrid({
      ...w,
      segments: [kept],
      nodes: w.nodes.filter(
        (n) => n.id !== removedRoad.start && n.id !== removedRoad.end,
      ),
    });
    expect(result.removed).toEqual(
      w.zoneBlocks.filter((b) => b.segment === removedRoad.id).map((b) => b.id),
    );
    expect(result.blocks.every((b) => b.segment === kept.id)).toBe(true);
    expect(valid(result.blocks).length).toBeGreaterThan(before);
    w = { ...w, ...result, zoneBlocks: result.blocks };
    expect(rebuildZoneGrid({ ...w, nodes: [], segments: [] }).blocks).toEqual(
      [],
    );
  });
  it('preserves zoning, grid phase and creation priority across a split not aligned to 8m', () => {
    const w = sync(road(empty(), p(-80, 0), p(80, 0))),
      old = w.segments[0]!;
    const target = cells(w.zoneBlocks).find(
      (c) => c.center.x === 44 && c.center.z === 20,
    )!;
    target.block.cells[target.index] = ZONE_CODES.RL;
    const node = {
      id: w.nextId,
      pos: p(3, 0),
      height: 60,
      segments: [w.nextId + 1, w.nextId + 2],
      control: 'none' as const,
    };
    const segment = (
      id: number,
      start: number,
      end: number,
      a: Vec2,
      b: Vec2,
    ): RoadSegment => ({
      ...old,
      id,
      start,
      end,
      c1: lerp(a, b, 1 / 3),
      c2: lerp(a, b, 2 / 3),
      length: Math.hypot(b.x - a.x, b.z - a.z),
      zoneBlockIds: [],
    });
    const split: ZoneGridWorld = {
      ...w,
      nodes: [...w.nodes, node],
      segments: [
        segment(w.nextId + 1, old.start, node.id, p(-80, 0), p(3, 0)),
        segment(w.nextId + 2, node.id, old.end, p(3, 0), p(80, 0)),
      ],
      nextId: w.nextId + 3,
    };
    const r = rebuildZoneGrid(split),
      preserved = cells(r.blocks).find(
        (c) => c.center.x === 44 && c.center.z === 20,
      )!;
    expect(preserved.code).toBe(ZONE_CODES.RL);
    expect(preserved.block.createdOrder).toBe(target.block.createdOrder);
    const repeat = rebuildZoneGrid({
      ...split,
      segments: r.segments,
      zoneBlocks: r.blocks,
      nextId: r.nextId,
    });
    expect(repeat.blocks).toEqual(r.blocks);
    expect(repeat.nextId).toBe(r.nextId);
  });
  it('clips service building footprints but preserves cells occupied by their own building', () => {
    let w = sync(road(empty(), p(-80, 0), p(80, 0)));
    const cell = cells(w.zoneBlocks).find(
      (c) => c.center.x === 4 && c.center.z === 20,
    )!;
    const b = building(p(4, 16));
    const blocked = rebuildZoneGrid({ ...w, buildings: [b] });
    expect(
      cells(blocked.blocks).find((c) => c.center.x === 4 && c.center.z === 20)!
        .code,
    ).toBe(255);
    cell.block.buildingAt[cell.index] = b.id;
    cell.block.cells[cell.index] = ZONE_CODES.RL;
    w = { ...w, buildings: [b] };
    const r = rebuildZoneGrid(w);
    expect(
      cells(r.blocks).find((c) => c.center.x === 4 && c.center.z === 20)!.code,
    ).toBe(ZONE_CODES.RL);
  });
  it('clips cells beyond the world boundary', () => {
    const r = rebuildZoneGrid(road(empty(), p(-80, 2392), p(80, 2392)));
    expect(
      r.blocks.find((b) => b.side === 1)!.cells.every((c) => c === 255),
    ).toBe(true);
  });
});
describe('whole-footprint zoning terrain checks', () => {
  const polygon = [p(-4, -4), p(4, -4), p(4, 4), p(-4, 4)];
  it('finds a water pocket even when every cell corner is above the water plane', () => {
    const heights = new Float32Array(WORLD.heightmapVertices ** 2).fill(40.9),
      k = 150 * WORLD.heightmapVertices + 150;
    heights[k] = 39.9;
    expect(polygon.every((p) => meshHeightAt(heights, p.x, p.z) > 40)).toBe(
      true,
    );
    expect(zoneTerrainValid(polygon, heights)).toBe(false);
  });
  it('accepts 25 percent slope but rejects greater combined gradients', () => {
    const heights = (gx: number, gz: number) =>
      Float32Array.from(
        { length: WORLD.heightmapVertices ** 2 },
        (_, i) =>
          60 +
          gx * ((i % 301) - 150) * 16 +
          gz * (Math.floor(i / 301) - 150) * 16,
      );
    expect(zoneTerrainValid(polygon, heights(0.25, 0))).toBe(true);
    expect(zoneTerrainValid(polygon, heights(0.251, 0))).toBe(false);
    expect(zoneTerrainValid(polygon, heights(0.2, 0.2))).toBe(false);
  });
  it('rejects malformed intersecting terrain samples', () => {
    const h = empty().heights;
    h[150 * 301 + 150] = NaN;
    expect(zoneTerrainValid(polygon, h)).toBe(false);
  });
});
