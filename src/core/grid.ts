import type { Vec2 } from './math';

/** Finite rectangular grid with row-major indices and half-open world bounds. */
export class Grid {
  readonly origin: Readonly<Vec2>;
  /** Define dimensions in cells, cell size in world units and the lower-left origin. */
  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
    origin: Readonly<Vec2> = { x: 0, z: 0 },
  ) {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      !Number.isSafeInteger(width * height) ||
      !Number.isFinite(cellSize) ||
      cellSize <= 0 ||
      !Number.isFinite(origin.x) ||
      !Number.isFinite(origin.z)
    )
      throw new RangeError('Invalid grid dimensions or origin');
    this.origin = Object.freeze({ ...origin });
  }
  /** Check integer coordinates without clamping them. */
  contains(x: number, z: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(z) &&
      x >= 0 &&
      z >= 0 &&
      x < this.width &&
      z < this.height
    );
  }
  /** Convert valid cell coordinates to a row-major index. */
  index(x: number, z: number): number {
    if (!this.contains(x, z)) throw new RangeError('Cell outside grid');
    return z * this.width + x;
  }
  /** Convert an index to integer cell coordinates. */
  cell(index: number): Vec2 {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.width * this.height
    )
      throw new RangeError('Index outside grid');
    return { x: index % this.width, z: Math.floor(index / this.width) };
  }
  /** Convert world coordinates using floor; outside coordinates return null. */
  worldToCell(point: Readonly<Vec2>): Vec2 | null {
    const x = Math.floor((point.x - this.origin.x) / this.cellSize),
      z = Math.floor((point.z - this.origin.z) / this.cellSize);
    return this.contains(x, z) ? { x, z } : null;
  }
  /** Return the world position of a cell center. */
  cellCenter(x: number, z: number): Vec2 {
    this.index(x, z);
    return {
      x: this.origin.x + (x + 0.5) * this.cellSize,
      z: this.origin.z + (z + 0.5) * this.cellSize,
    };
  }
  /** List valid neighboring indices in row-major order, optionally including diagonals. */
  neighbors(index: number, diagonals = false): number[] {
    const { x, z } = this.cell(index),
      result: number[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dz === 0) || (!diagonals && dx !== 0 && dz !== 0))
          continue;
        if (this.contains(x + dx, z + dz))
          result.push(this.index(x + dx, z + dz));
      }
    return result;
  }
}
