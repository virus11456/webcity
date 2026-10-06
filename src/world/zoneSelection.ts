import { CELL_SIZE } from '../data/config';
import { ZONE_TOOL } from '../data/zoneTool';
import { ZONE_CODES } from '../data/zones';
import { zoneCellCenter } from './zoneGrid';
import {
  zoneCellOwned,
  zoneRoadAllows,
  type ZoneCell,
  type ZoningWorld,
} from './zoning';
import type { Vec2, ZoneBlock, ZoneType, RoadSegment } from './types';

interface Cell {
  ref: ZoneCell;
  center: Vec2;
  block: ZoneBlock;
}
/** Cached spatial lookup rebuilt only on world events, never while moving a pointer. */
export class ZoneSelection {
  private readonly roads: Map<number, RoadSegment>;
  private readonly buckets = new Map<string, Cell[]>();
  private readonly byKey = new Map<string, Cell>();
  constructor(world: ZoningWorld) {
    this.roads = new Map(world.segments.map((r) => [r.id, r]));
    for (const block of world.zoneBlocks)
      block.cells.forEach((code, i) => {
        if (
          code === ZONE_CODES.invalid ||
          !zoneCellOwned(block, i, world.ownedTiles)
        )
          return;
        const cell: Cell = {
          ref: [block.id, i],
          center: zoneCellCenter(block, i),
          block,
        };
        const key = this.bucket(cell.center.x, cell.center.z);
        const bucket = this.buckets.get(key) ?? [];
        bucket.push(cell);
        this.buckets.set(key, bucket);
        this.byKey.set(`${block.id}:${i}`, cell);
      });
  }
  private bucket(x: number, z: number): string {
    return `${Math.floor(x / ZONE_TOOL.spatialBucketM)}:${Math.floor(z / ZONE_TOOL.spatialBucketM)}`;
  }
  private candidates(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): Cell[] {
    const result: Cell[] = [],
      size = ZONE_TOOL.spatialBucketM;
    for (let z = Math.floor(minZ / size); z <= Math.floor(maxZ / size); z++)
      for (let x = Math.floor(minX / size); x <= Math.floor(maxX / size); x++)
        result.push(...(this.buckets.get(`${x}:${z}`) ?? []));
    return result;
  }
  private allows(cell: Cell, zone: ZoneType | null): boolean {
    return (
      zoneRoadAllows(this.roads.get(cell.block.segment), zone) &&
      cell.block.buildingAt[cell.ref[1]] === -1
    );
  }
  /** Return the oriented cell under a point, not just the closest grid center. */
  hit(p: Vec2): Cell | undefined {
    return this.candidates(
      p.x - CELL_SIZE,
      p.x + CELL_SIZE,
      p.z - CELL_SIZE,
      p.z + CELL_SIZE,
    ).find((c) => {
      const x = p.x - c.center.x,
        z = p.z - c.center.z,
        d = c.block.dir;
      return (
        Math.abs(x * d.x + z * d.z) <= CELL_SIZE / 2 &&
        Math.abs(-x * d.z + z * d.x) <= CELL_SIZE / 2
      );
    });
  }
  /** Four-neighbor flood fill never crosses invalid, occupied or differently zoned cells. */
  fill(p: Vec2, zone: ZoneType | null): ZoneCell[] {
    const start = this.hit(p);
    if (!start || !this.allows(start, zone)) return [];
    const block = start.block,
      target = block.cells[start.ref[1]];
    if (
      (zone !== null && target !== ZONE_CODES.none) ||
      (zone === null && target === ZONE_CODES.none)
    )
      return [];
    const queue = [start.ref[1]],
      seen = new Set(queue),
      result: ZoneCell[] = [];
    for (let q = 0; q < queue.length; q++) {
      const index = queue[q]!,
        cell = this.byKey.get(`${block.id}:${index}`);
      if (!cell || block.cells[index] !== target || !this.allows(cell, zone))
        continue;
      result.push(cell.ref);
      const col = index % block.width;
      for (const n of [
        col > 0 ? index - 1 : -1,
        col + 1 < block.width ? index + 1 : -1,
        index - block.width,
        index + block.width,
      ])
        if (n >= 0 && n < block.cells.length && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    }
    return result;
  }
  /** World-axis rectangle selects cell centers (including rotated roadside grids). */
  rectangle(a: Vec2, b: Vec2, zone: ZoneType | null): ZoneCell[] {
    const minX = Math.min(a.x, b.x),
      maxX = Math.max(a.x, b.x),
      minZ = Math.min(a.z, b.z),
      maxZ = Math.max(a.z, b.z);
    return this.candidates(minX, maxX, minZ, maxZ)
      .filter(
        (c) =>
          c.center.x >= minX &&
          c.center.x <= maxX &&
          c.center.z >= minZ &&
          c.center.z <= maxZ &&
          this.allows(c, zone),
      )
      .map((c) => c.ref);
  }
  /** Swept circular brush fills gaps even if the browser coalesces fast pointer moves. */
  brush(a: Vec2, b: Vec2, radius: number, zone: ZoneType | null): ZoneCell[] {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length2 = dx * dx + dz * dz;
    return this.candidates(
      Math.min(a.x, b.x) - radius,
      Math.max(a.x, b.x) + radius,
      Math.min(a.z, b.z) - radius,
      Math.max(a.z, b.z) + radius,
    )
      .filter((c) => {
        if (!this.allows(c, zone)) return false;
        const t = length2
          ? Math.max(
              0,
              Math.min(
                1,
                ((c.center.x - a.x) * dx + (c.center.z - a.z) * dz) / length2,
              ),
            )
          : 0;
        return (
          (c.center.x - a.x - t * dx) ** 2 + (c.center.z - a.z - t * dz) ** 2 <=
          radius ** 2
        );
      })
      .map((c) => c.ref);
  }
}
