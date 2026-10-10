import { BUILDINGS, type BuildingDefinition } from '../data/buildings';
import { SERVICES } from '../data/services';
import { BULLDOZE } from '../data/bulldoze';
import { CELL_SIZE, MAP_SIZE } from '../data/config';
import { ROADS } from '../data/roads';
import { closestPointOnSegment } from '../core/math';
import { sampleRoad, type RoadSample } from './roadProfile';
import { previewFacility, type PowerWorld, type PowerPreview } from './power';
import type { Building, RoadNode, RoadSegment, Vec2 } from './types';
export const serviceDefinition = (
  id: string,
): BuildingDefinition | undefined =>
  (SERVICES.ids as readonly string[]).includes(id)
    ? BUILDINGS.find((d) => d.id === id)
    : undefined;
export interface ServiceStatus {
  radius: number;
  capacity: number;
  demand: number;
  efficiency: number;
  connected: boolean;
}
interface Link {
  segment: RoadSegment;
  points: RoadSample[];
  length: number;
}
export interface ServiceAccess {
  road: number;
  distance: number;
}
export interface ServiceReach {
  origin: ServiceAccess;
  distances: Map<number, number>;
  radius: number;
}
export interface ServicePreview extends PowerPreview {
  trees?: Vec2[];
  roads: Vec2[][];
  radius: number;
}
/** Coverage is a distance field on the road centreline graph, not a Euclidean disk.
 * Coverage uses both directions; actual response vehicles use directed lanes. */
export class ServiceNetwork {
  readonly links = new Map<number, Link>();
  private adjacency = new Map<number, { to: number; cost: number }[]>();
  constructor(nodes: readonly RoadNode[], segments: readonly RoadSegment[]) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const segment of segments) {
      const a = byId.get(segment.start),
        b = byId.get(segment.end);
      if (!a || !b) continue;
      const points = sampleRoad(segment, a, b),
        length = points.at(-1)!.distance;
      this.links.set(segment.id, { segment, points, length });
      for (const [from, to] of [
        [a.id, b.id],
        [b.id, a.id],
      ] as const) {
        const edges = this.adjacency.get(from) ?? [];
        edges.push({ to, cost: length });
        this.adjacency.set(from, edges);
      }
    }
  }
  access(pos: Vec2, setback = 0): ServiceAccess | undefined {
    let best = Infinity,
      result: ServiceAccess | undefined;
    for (const [id, link] of this.links) {
      if (link.segment.elevated || ROADS[link.segment.type].zoning === 'none')
        continue;
      const limit =
        ROADS[link.segment.type].widthM / 2 +
        BULLDOZE.frontageToleranceM +
        setback;
      for (let i = 1; i < link.points.length; i++) {
        const a = link.points[i - 1]!,
          b = link.points[i]!,
          p = closestPointOnSegment(pos, a, b);
        if (p.distance <= limit && p.distance < best) {
          best = p.distance;
          result = {
            road: id,
            distance: a.distance + p.t * (b.distance - a.distance),
          };
        }
      }
    }
    return result;
  }
  reach(origin: ServiceAccess, radius: number): ServiceReach {
    const distances = new Map<number, number>(),
      heap: { id: number; d: number }[] = [];
    const push = (id: number, d: number) => {
      if (d > radius || d >= (distances.get(id) ?? Infinity)) return;
      distances.set(id, d);
      let i = heap.length;
      heap.push({ id, d });
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent]!.d <= d) break;
        heap[i] = heap[parent]!;
        i = parent;
      }
      heap[i] = { id, d };
    };
    const road = this.links.get(origin.road)!;
    push(road.segment.start, origin.distance);
    push(road.segment.end, road.length - origin.distance);
    while (heap.length) {
      const current = heap[0]!,
        last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1]!.d < heap[child]!.d)
            child++;
          if (heap[child]!.d >= last.d) break;
          heap[i] = heap[child]!;
          i = child;
        }
        heap[i] = last;
      }
      if (current.d !== distances.get(current.id)) continue;
      for (const e of this.adjacency.get(current.id) ?? [])
        push(e.to, current.d + e.cost);
    }
    return { origin, distances, radius };
  }
  distance(reach: ServiceReach, target: ServiceAccess): number {
    const link = this.links.get(target.road);
    if (!link) return Infinity;
    return Math.min(
      target.road === reach.origin.road
        ? Math.abs(target.distance - reach.origin.distance)
        : Infinity,
      (reach.distances.get(link.segment.start) ?? Infinity) + target.distance,
      (reach.distances.get(link.segment.end) ?? Infinity) +
        link.length -
        target.distance,
    );
  }
  coverage(reach: ServiceReach, target: ServiceAccess | undefined): number {
    return target
      ? Math.max(0, 1 - this.distance(reach, target) / reach.radius)
      : 0;
  }
  /** Exact clipped road pieces for previews and rasterization, including a long source edge. */
  pieces(reach: ServiceReach): Vec2[][] {
    const result: Vec2[][] = [];
    for (const [id, link] of this.links) {
      if (link.segment.elevated || ROADS[link.segment.type].zoning === 'none')
        continue;
      const spans: [number, number][] = [];
      const a =
          reach.radius - (reach.distances.get(link.segment.start) ?? Infinity),
        b = reach.radius - (reach.distances.get(link.segment.end) ?? Infinity);
      if (a > 0) spans.push([0, Math.min(link.length, a)]);
      if (b > 0) spans.push([Math.max(0, link.length - b), link.length]);
      if (id === reach.origin.road)
        spans.push([
          Math.max(0, reach.origin.distance - reach.radius),
          Math.min(link.length, reach.origin.distance + reach.radius),
        ]);
      for (const [lo, hi] of spans) {
        const line: Vec2[] = [];
        for (let i = 1; i < link.points.length; i++) {
          const p = link.points[i - 1]!,
            q = link.points[i]!;
          const start = Math.max(lo, p.distance),
            end = Math.min(hi, q.distance);
          if (end <= start) continue;
          for (const d of [start, end]) {
            const t = (d - p.distance) / (q.distance - p.distance);
            line.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
          }
        }
        if (line.length) result.push(line);
      }
    }
    return result;
  }
  /** Fill roadside cells with the same road-distance attenuation as building coverage. */
  raster(
    reach: ServiceReach,
    field: Float32Array,
    size: number,
    efficiency: number,
  ): void {
    const cell = MAP_SIZE / size;
    for (const [id, link] of this.links) {
      if (link.segment.elevated || ROADS[link.segment.type].zoning === 'none')
        continue;
      if (
        id !== reach.origin.road &&
        Math.min(
          reach.distances.get(link.segment.start) ?? Infinity,
          reach.distances.get(link.segment.end) ?? Infinity,
        ) >= reach.radius
      )
        continue;
      const width =
        ROADS[link.segment.type].widthM / 2 +
        CELL_SIZE * SERVICES.frontageCells;
      for (let i = 1; i < link.points.length; i++) {
        const a = link.points[i - 1]!,
          b = link.points[i]!;
        const minX = Math.max(
            0,
            Math.floor((Math.min(a.x, b.x) - width + MAP_SIZE / 2) / cell),
          ),
          maxX = Math.min(
            size - 1,
            Math.floor((Math.max(a.x, b.x) + width + MAP_SIZE / 2) / cell),
          );
        const minZ = Math.max(
            0,
            Math.floor((Math.min(a.z, b.z) - width + MAP_SIZE / 2) / cell),
          ),
          maxZ = Math.min(
            size - 1,
            Math.floor((Math.max(a.z, b.z) + width + MAP_SIZE / 2) / cell),
          );
        for (let z = minZ; z <= maxZ; z++)
          for (let x = minX; x <= maxX; x++) {
            const p = closestPointOnSegment(
              {
                x: (x + 0.5) * cell - MAP_SIZE / 2,
                z: (z + 0.5) * cell - MAP_SIZE / 2,
              },
              a,
              b,
            );
            if (p.distance > width) continue;
            const value =
              this.coverage(reach, {
                road: id,
                distance: a.distance + p.t * (b.distance - a.distance),
              }) * efficiency;
            const index = z * size + x;
            field[index] = Math.max(field[index]!, value);
          }
      }
    }
  }
}
export function previewService(
  w: PowerWorld,
  id: string,
  pos: Vec2,
  rotation: number,
  budget = 1,
  network = new ServiceNetwork(w.nodes, w.segments),
): ServicePreview {
  const definition = serviceDefinition(id),
    p = previewFacility(w, id, pos, rotation, {
      definition,
      maxSlope: SERVICES.maxSlope,
      maxHeightDifferenceM: SERVICES.maxHeightDifferenceM,
    });
  const center = p.points.length
    ? p.points.reduce(
        (a, b) => ({
          x: a.x + b.x / p.points.length,
          z: a.z + b.z / p.points.length,
        }),
        { x: 0, z: 0 },
      )
    : pos;
  const radius = (definition?.radiusM ?? 0) * budget,
    access = network.access(pos);
  if (p.valid && !access && id !== 'tree') {
    p.valid = false;
    p.reason = 'err.serviceRoad';
  }
  return {
    ...p,
    radius,
    roads:
      definition?.kind === 'park'
        ? [
            Array.from({ length: 33 }, (_, i) => ({
              x: center.x + Math.cos((i * Math.PI) / 16) * radius,
              z: center.z + Math.sin((i * Math.PI) / 16) * radius,
            })),
          ]
        : access
          ? network.pieces(network.reach(access, radius))
          : [],
  };
}
export function serviceDemand(
  def: BuildingDefinition,
  buildings: readonly Building[],
  eligibleStudents = 0,
): number {
  if (def.service === 'education') return eligibleStudents;
  if (def.service === 'fire')
    return buildings.filter((b) => b.state === 'active').length;
  const residents = buildings.reduce((n, b) => n + b.residents, 0);
  return def.service === 'health'
    ? residents * SERVICES.patientFraction
    : residents;
}
export function serviceCapacity(
  def: BuildingDefinition,
  budget: number,
): number {
  const c = def.capacity;
  return (
    budget *
    (c?.students ??
      c?.patients ??
      (c?.vehicles ?? 0) *
        (def.service === 'police'
          ? SERVICES.peoplePerPoliceCar
          : SERVICES.buildingsPerFireTruck))
  );
}
