import type { Vec2 } from './math';

/** Point spatial hash. Positions are copied; update with set after moving an item. */
export class SpatialHash<Id extends string | number = number> {
  private readonly buckets = new Map<string, Set<Id>>();
  private readonly positions = new Map<Id, Vec2>();
  /** Use a positive cell size in world units; negative world coordinates are supported. */
  constructor(readonly cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0)
      throw new RangeError('Invalid spatial cell size');
  }
  /** Number of indexed IDs. */
  get size(): number {
    return this.positions.size;
  }
  private cell(value: number): number {
    const cell = Math.floor(value / this.cellSize);
    if (!Number.isSafeInteger(cell))
      throw new RangeError('Spatial coordinate outside safe range');
    return cell;
  }
  private key(point: Readonly<Vec2>): string {
    return `${this.cell(point.x)},${this.cell(point.z)}`;
  }
  /** Insert or move an ID atomically, without retaining the caller's vector. */
  set(id: Id, point: Readonly<Vec2>): void {
    const key = this.key(point);
    this.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Set();
      this.buckets.set(key, bucket);
    }
    bucket.add(id);
    this.positions.set(id, { ...point });
  }
  /** Remove an ID; return whether it existed. */
  delete(id: Id): boolean {
    const point = this.positions.get(id);
    if (!point) return false;
    const key = this.key(point),
      bucket = this.buckets.get(key)!;
    bucket.delete(id);
    if (bucket.size === 0) this.buckets.delete(key);
    return this.positions.delete(id);
  }
  /** Query an inclusive axis-aligned box, testing exact positions after bucket lookup. */
  queryBox(min: Readonly<Vec2>, max: Readonly<Vec2>): Id[] {
    const x0 = this.cell(min.x),
      z0 = this.cell(min.z),
      x1 = this.cell(max.x),
      z1 = this.cell(max.z);
    if (min.x > max.x || min.z > max.z)
      throw new RangeError('Inverted query bounds');
    // Huge sparse queries scan occupied points instead of billions of empty cells.
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > this.buckets.size) {
      const matches: Id[] = [];
      for (const [id, p] of this.positions) {
        if (p.x >= min.x && p.x <= max.x && p.z >= min.z && p.z <= max.z)
          matches.push(id);
      }
      return matches;
    }
    const result: Id[] = [];
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const bucket = this.buckets.get(`${x},${z}`);
        if (!bucket) continue;
        for (const id of bucket) {
          const p = this.positions.get(id)!;
          if (p.x >= min.x && p.x <= max.x && p.z >= min.z && p.z <= max.z)
            result.push(id);
        }
      }
    return result;
  }
  /** Query an inclusive circle; candidates in corner buckets are filtered out. */
  queryRadius(center: Readonly<Vec2>, radius: number): Id[] {
    if (!Number.isFinite(radius) || radius < 0)
      throw new RangeError('Invalid query radius');
    return this.queryBox(
      { x: center.x - radius, z: center.z - radius },
      { x: center.x + radius, z: center.z + radius },
    ).filter((id) => {
      const p = this.positions.get(id)!;
      return Math.hypot(p.x - center.x, p.z - center.z) <= radius;
    });
  }
  /** Remove all indexed objects and buckets. */
  clear(): void {
    this.buckets.clear();
    this.positions.clear();
  }
}
