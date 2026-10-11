import { DISTRICTS as D } from '../data/districts';
import { MAP_SIZE, MAP_TILES, TILE_SIZE } from '../data/config';
import type { Building, Vec2 } from './types';
export interface District {
  id: number;
  name: string;
  cells: number[];
}
export interface DistrictView extends District {
  population: number;
  households: number;
  jobs: number;
  workers: number;
  buildings: number;
  area: number;
  center: Vec2;
}
export function districtCell(p: Vec2): number {
  const x = Math.floor((p.x + MAP_SIZE / 2) / D.cellM),
    z = Math.floor((p.z + MAP_SIZE / 2) / D.cellM);
  return x < 0 || z < 0 || x >= D.gridSize || z >= D.gridSize
    ? -1
    : z * D.gridSize + x;
}
export function districtPoint(cell: number): Vec2 {
  return {
    x: ((cell % D.gridSize) + 0.5) * D.cellM - MAP_SIZE / 2,
    z: (Math.floor(cell / D.gridSize) + 0.5) * D.cellM - MAP_SIZE / 2,
  };
}
const cached = new WeakMap<readonly District[], Float64Array>();
/** Commands replace the collection, so all consumers share one immutable derived ownership index. */
function districtIndex(districts: readonly District[]): Float64Array {
  let index = cached.get(districts);
  if (!index) {
    index = new Float64Array(D.gridSize ** 2);
    for (const d of districts) for (const cell of d.cells) index[cell] = d.id;
    cached.set(districts, index);
  }
  return index;
}
export function districtAt(districts: readonly District[], p: Vec2): number {
  return districtIndex(districts)[districtCell(p)] ?? 0;
}
export function districtBrush(
  points: readonly Vec2[],
  radius: number,
  owned: readonly number[],
): number[] {
  const cells = new Set<number>();
  const samples: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!,
      a = points[i - 1] ?? p;
    const count = Math.max(
      1,
      Math.ceil(Math.hypot(p.x - a.x, p.z - a.z) / (radius / 2)),
    );
    for (let j = 1; j <= count; j++)
      samples.push({
        x: a.x + ((p.x - a.x) * j) / count,
        z: a.z + ((p.z - a.z) * j) / count,
      });
  }
  for (const p of samples) {
    const loX = Math.max(
        0,
        Math.floor((p.x - radius + MAP_SIZE / 2) / D.cellM),
      ),
      hiX = Math.min(
        D.gridSize - 1,
        Math.floor((p.x + radius + MAP_SIZE / 2) / D.cellM),
      );
    const loZ = Math.max(
        0,
        Math.floor((p.z - radius + MAP_SIZE / 2) / D.cellM),
      ),
      hiZ = Math.min(
        D.gridSize - 1,
        Math.floor((p.z + radius + MAP_SIZE / 2) / D.cellM),
      );
    for (let z = loZ; z <= hiZ; z++)
      for (let x = loX; x <= hiX; x++) {
        const cell = z * D.gridSize + x,
          q = districtPoint(cell);
        const tile =
          Math.floor((q.z + MAP_SIZE / 2) / TILE_SIZE) * MAP_TILES +
          Math.floor((q.x + MAP_SIZE / 2) / TILE_SIZE);
        if (Math.hypot(q.x - p.x, q.z - p.z) <= radius && owned.includes(tile))
          cells.add(cell);
      }
  }
  return [...cells].sort((a, b) => a - b);
}
export function paintDistrict(
  districts: readonly District[],
  id: number | null,
  cells: readonly number[],
): District[] {
  const painted = new Set(cells);
  return districts.map((d) => ({
    ...d,
    cells: [
      ...new Set([
        ...d.cells.filter((c) => !painted.has(c)),
        ...(d.id === id ? cells : []),
      ]),
    ].sort((a, b) => a - b),
  }));
}
export function districtViews(
  districts: readonly District[],
  buildings: readonly Building[],
): DistrictView[] {
  const views = districts.map((d) => ({
    ...structuredClone(d),
    population: 0,
    households: 0,
    jobs: 0,
    workers: 0,
    buildings: 0,
    area: d.cells.length * D.cellM ** 2,
    center: { x: 0, z: 0 },
  }));
  const byId = new Map(views.map((d) => [d.id, d]));
  for (const d of views)
    for (const cell of d.cells) {
      const p = districtPoint(cell);
      d.center.x += p.x / d.cells.length;
      d.center.z += p.z / d.cells.length;
    }
  for (const b of buildings) {
    const d = byId.get(districtAt(districts, b.pos));
    if (!d) continue;
    d.buildings++;
    d.population += b.residents;
    d.households += b.housing?.occupied ?? 0;
    d.jobs += b.jobs;
    d.workers += b.workers;
  }
  return views;
}

export type DistrictAction =
  | { action: 'create'; name: string }
  | { action: 'rename'; id: number; name: string }
  | { action: 'delete'; id: number }
  | { action: 'paint'; id: number | null; points: Vec2[]; radius: number };
