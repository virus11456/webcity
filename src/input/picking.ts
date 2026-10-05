import { Raycaster, Vector2, Vector3, type Camera } from 'three';
import {
  CELL_SIZE,
  MAP_CELLS,
  MAP_SIZE,
  MAP_TILES,
  TILE_CELLS,
  WORLD,
} from '../data/config';
import { TERRAIN } from '../data/terrain';
import { PICKING } from '../data/picking';
import { meshHeightAt } from '../world/heightField';
import type { Terrain } from '../world/terrain';
import type { TerrainPick } from '../world/picking';
interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}
interface Point3 {
  x: number;
  y: number;
  z: number;
}
interface Viewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Chunk broad phase followed by height-field stepping and bisection. Scratch storage is reused. */
export class TerrainPicker {
  private readonly chunks: Bounds[] = [];
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly direction = new Vector3();
  private readonly result: TerrainPick = {
    world: { x: 0, y: 0, z: 0 },
    cell: { x: 0, z: 0, index: 0 },
    tile: { x: 0, z: 0, index: 0 },
    owned: false,
    distance: 0,
  };
  private revision = -1;
  private near = 0;
  private far = 0;
  constructor(
    private readonly terrain: Pick<Terrain, 'heights' | 'revision'>,
    private readonly ownsTile: (index: number) => boolean = (index) =>
      index === WORLD.startTile[1] * MAP_TILES + WORLD.startTile[0],
  ) {
    const step = TERRAIN.chunkCells * CELL_SIZE,
      half = MAP_SIZE / 2;
    for (let z = -half; z < half; z += step)
      for (let x = -half; x < half; x += step)
        this.chunks.push({
          minX: x,
          maxX: Math.min(half, x + step),
          minZ: z,
          maxZ: Math.min(half, z + step),
          minY: 0,
          maxY: 0,
        });
    this.refit();
  }
  private refit(): void {
    if (this.revision === this.terrain.revision) return;
    const half = MAP_SIZE / 2,
      spacing = WORLD.heightmapSpacingM,
      size = WORLD.heightmapVertices;
    for (const b of this.chunks) {
      let min = Infinity,
        max = -Infinity;
      for (
        let j = (b.minZ + half) / spacing;
        j <= (b.maxZ + half) / spacing;
        j++
      )
        for (
          let i = (b.minX + half) / spacing;
          i <= (b.maxX + half) / spacing;
          i++
        ) {
          const h = this.terrain.heights[j * size + i]!;
          min = Math.min(min, h);
          max = Math.max(max, h);
        }
      b.minY = min - PICKING.boxPaddingM;
      b.maxY = max + PICKING.boxPaddingM;
    }
    this.revision = this.terrain.revision;
  }
  private slab(
    origin: number,
    direction: number,
    min: number,
    max: number,
  ): boolean {
    if (Math.abs(direction) < Number.EPSILON)
      return origin >= min && origin <= max;
    const a = (min - origin) / direction,
      b = (max - origin) / direction;
    this.near = Math.max(this.near, Math.min(a, b));
    this.far = Math.min(this.far, Math.max(a, b));
    return this.far >= this.near;
  }
  // Stop at mesh cell and diagonal boundaries: a near-tangent hill can be thinner than stepM.
  private boundaryDistance(
    coordinate: number,
    direction: number,
    offset: number,
  ): number {
    if (Math.abs(direction) < Number.EPSILON) return Infinity;
    const grid = (coordinate + offset) / WORLD.heightmapSpacingM;
    const next =
      direction > 0
        ? Math.floor(grid + 1e-10) + 1
        : Math.ceil(grid - 1e-10) - 1;
    return (next * WORLD.heightmapSpacingM - offset - coordinate) / direction;
  }
  private gap(origin: Readonly<Point3>, distance: number): number {
    return (
      origin.y +
      this.direction.y * distance -
      meshHeightAt(
        this.terrain.heights,
        origin.x + this.direction.x * distance,
        origin.z + this.direction.z * distance,
      )
    );
  }
  /** Pick CSS client coordinates (not device pixels); the returned hit is borrowed until the next call. */
  pick(
    clientX: number,
    clientY: number,
    viewport: Readonly<Viewport>,
    camera: Camera,
    maxDistance: number,
  ): TerrainPick | null {
    const x = (clientX - viewport.left) / viewport.width,
      y = (clientY - viewport.top) / viewport.height;
    if (!(
      viewport.width > 0 &&
      viewport.height > 0 &&
      x >= 0 &&
      x < 1 &&
      y >= 0 &&
      y < 1
    ))
      return null;
    this.ndc.set(x * 2 - 1, 1 - y * 2);
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, camera);
    return this.raycast(
      this.raycaster.ray.origin,
      this.raycaster.ray.direction,
      maxDistance,
    );
  }
  /** Cast a finite world ray; direction is normalized internally and distance is measured in metres. */
  raycast(
    origin: Readonly<Point3>,
    direction: Readonly<Point3>,
    maxDistance: number,
  ): TerrainPick | null {
    if (
      !Number.isFinite(
        origin.x +
          origin.y +
          origin.z +
          direction.x +
          direction.y +
          direction.z,
      ) ||
      !Number.isFinite(maxDistance) ||
      maxDistance <= 0
    )
      return null;
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!Number.isFinite(length) || length === 0) return null;
    this.direction.set(
      direction.x / length,
      direction.y / length,
      direction.z / length,
    );
    this.refit();
    let best = Infinity;
    for (const box of this.chunks) {
      this.near = 0;
      this.far = Math.min(maxDistance, best);
      if (
        !this.slab(origin.x, this.direction.x, box.minX, box.maxX) ||
        !this.slab(origin.y, this.direction.y, box.minY, box.maxY) ||
        !this.slab(origin.z, this.direction.z, box.minZ, box.maxZ)
      )
        continue;
      let lo = this.near,
        previous = this.gap(origin, lo);
      if (Math.abs(previous) <= PICKING.heightToleranceM) {
        best = Math.min(best, lo);
        continue;
      }
      while (lo < this.far) {
        const x = origin.x + this.direction.x * lo,
          z = origin.z + this.direction.z * lo;
        const step = Math.min(
          PICKING.stepM,
          this.boundaryDistance(x, this.direction.x, MAP_SIZE / 2),
          this.boundaryDistance(z, this.direction.z, MAP_SIZE / 2),
          this.boundaryDistance(
            x + z,
            this.direction.x + this.direction.z,
            MAP_SIZE,
          ),
        );
        let hi = Math.min(this.far, lo + step);
        const current = this.gap(origin, hi);
        if (previous * current <= 0) {
          for (let i = 0; i < PICKING.iterations; i++) {
            const mid = (lo + hi) / 2,
              value = this.gap(origin, mid);
            if (previous * value <= 0) hi = mid;
            else {
              lo = mid;
              previous = value;
            }
          }
          best = Math.min(best, (lo + hi) / 2);
          break;
        }
        lo = hi;
        previous = current;
      }
    }
    if (!Number.isFinite(best)) return null;
    const x = origin.x + this.direction.x * best,
      z = origin.z + this.direction.z * best;
    const cx = Math.floor((x + MAP_SIZE / 2) / CELL_SIZE),
      cz = Math.floor((z + MAP_SIZE / 2) / CELL_SIZE);
    if (cx < 0 || cz < 0 || cx >= MAP_CELLS || cz >= MAP_CELLS) return null;
    const r = this.result;
    r.world.x = x;
    r.world.z = z;
    r.world.y = meshHeightAt(this.terrain.heights, x, z);
    r.distance = best;
    r.cell.x = cx;
    r.cell.z = cz;
    r.cell.index = cz * MAP_CELLS + cx;
    r.tile.x = Math.floor(cx / TILE_CELLS);
    r.tile.z = Math.floor(cz / TILE_CELLS);
    r.tile.index = r.tile.z * MAP_TILES + r.tile.x;
    r.owned = this.ownsTile(r.tile.index);
    return r;
  }
}
