import { Rng } from '../core/rng';
import { CELL_SIZE, MAP_SIZE, SEA_LEVEL, WORLD } from '../data/config';
import { VEGETATION as V } from '../data/vegetation';
import { ROADS } from '../data/roads';
import { sampleRoad } from './roadProfile';
import type { Terrain } from './terrain';
import type { Building, RoadNode, RoadSegment } from './types';
const half = MAP_SIZE / 2;
export interface VegetationData {
  positions: Float32Array;
  species: Uint8Array;
  scales: Float32Array;
  count: number;
}
export function vegetationData(): VegetationData {
  const capacity = V.trees + V.shrubs;
  return {
    positions: new Float32Array(capacity * 3),
    species: new Uint8Array(capacity),
    scales: new Float32Array(capacity),
    count: 0,
  };
}
/** Bounded batches let render schedule generation without blocking input. Pure seeded world data. */
export function* generateVegetation(
  terrain: Pick<Terrain, 'seed' | 'heightAt' | 'resources'>,
  data: VegetationData,
): Generator<void> {
  const rng = new Rng((terrain.seed + V.seedOffset) >>> 0),
    capacity = data.species.length;
  data.count = 0;
  for (
    let attempt = 0;
    attempt < capacity * V.attemptsPerPlant && data.count < capacity;
    attempt++
  ) {
    if (attempt % V.workSlice === 0) yield;
    const x = rng.float(-half, half),
      z = rng.float(-half, half);
    const cell =
      Math.floor((z + half) / WORLD.fieldSpacingM) * WORLD.fieldCells +
      Math.floor((x + half) / WORLD.fieldSpacingM);
    if (rng.next() >= (terrain.resources.forest[cell] ?? 0) / 255) continue;
    const y = terrain.heightAt(x, z);
    if (y <= SEA_LEVEL + V.waterClearanceM) continue;
    const i = data.count++,
      species =
        i < V.trees
          ? Math.floor(rng.next() * 6)
          : 6 + Math.floor(rng.next() * 2);
    data.positions[i * 3] = x;
    data.positions[i * 3 + 1] = y;
    data.positions[i * 3 + 2] = z;
    data.species[i] = species;
    data.scales[i] = rng.float(0.8, 1.2);
  }
}
export interface VegetationWorld {
  nodes: readonly RoadNode[];
  segments: readonly RoadSegment[];
  buildings: readonly Pick<
    Building,
    'pos' | 'rotation' | 'lotW' | 'lotD' | 'defId'
  >[];
}
/** Conservative crown clearance raster. Derived only from authoritative roads and footprints. */
export class VegetationOccupancy {
  private readonly side = Math.ceil(MAP_SIZE / V.occupancyCellM);
  private readonly cells = new Uint8Array(this.side ** 2);
  blocked(x: number, z: number): boolean {
    const ix = Math.floor((x + half) / V.occupancyCellM),
      iz = Math.floor((z + half) / V.occupancyCellM);
    return (
      ix < 0 ||
      iz < 0 ||
      ix >= this.side ||
      iz >= this.side ||
      this.cells[iz * this.side + ix] !== 0
    );
  }
  private box(x0: number, z0: number, x1: number, z1: number): void {
    const a = Math.max(0, Math.floor((x0 + half) / V.occupancyCellM)),
      b = Math.min(this.side - 1, Math.floor((x1 + half) / V.occupancyCellM));
    const c = Math.max(0, Math.floor((z0 + half) / V.occupancyCellM)),
      d = Math.min(this.side - 1, Math.floor((z1 + half) / V.occupancyCellM));
    for (let z = c; z <= d; z++)
      this.cells.fill(1, z * this.side + a, z * this.side + b + 1);
  }
  *sync(world: VegetationWorld): Generator<void> {
    this.cells.fill(0);
    const nodes = new Map(world.nodes.map((n) => [n.id, n]));
    for (const s of world.segments) {
      // Trees remain under elevated roads; their original terrain heights are retained.
      if (s.elevated) continue;
      const a = nodes.get(s.start),
        b = nodes.get(s.end);
      if (!a || !b) continue;
      const points = sampleRoad(s, a, b),
        r = ROADS[s.type].widthM / 2 + V.crownClearanceM;
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1]!,
          q = points[i]!;
        this.box(
          Math.min(p.x, q.x) - r,
          Math.min(p.z, q.z) - r,
          Math.max(p.x, q.x) + r,
          Math.max(p.z, q.z) + r,
        );
      }
      yield;
    }
    for (const b of world.buildings) {
      if (b.defId === 'tree') continue;
      const c = Math.cos(b.rotation),
        s = Math.sin(b.rotation),
        w = (b.lotW * CELL_SIZE) / 2,
        d = b.lotD * CELL_SIZE;
      const x = b.pos.x + (s * d) / 2,
        z = b.pos.z + (c * d) / 2;
      const rx = Math.abs(c * w) + Math.abs((s * d) / 2) + V.crownClearanceM,
        rz = Math.abs(s * w) + Math.abs((c * d) / 2) + V.crownClearanceM;
      this.box(x - rx, z - rz, x + rx, z + rz);
      yield;
    }
  }
}
