import { closestPointOnSegment, distance, lerp } from '../core/math';
import { SpatialHash } from '../core/spatial';
import { CELL_SIZE } from '../data/config';
import { GROWTH, ZONE_CODES } from '../data/zones';
import { ZONE_GRID as C } from '../data/zoneGrid';
import { ROADS } from '../data/roads';
import { ROAD_MESH } from '../data/roadMesh';
import { sampleRoad, type RoadSample } from './roadProfile';
import {
  ZonePolygonIndex,
  zoneBuildingFootprint,
  zonePolygonsOverlap,
  zoneTerrainValid,
  type Polygon,
} from './zoneGeometry';
import type { Building, RoadNode, RoadSegment, Vec2, ZoneBlock } from './types';
export interface ZoneGridWorld {
  nodes: readonly RoadNode[];
  segments: readonly RoadSegment[];
  heights: Float32Array;
  buildings: readonly Building[];
  zoneBlocks: readonly ZoneBlock[];
  nextId: number;
}
export interface ZoneGridChange {
  blocks: ZoneBlock[];
  removed: number[];
  segments: RoadSegment[];
  nextId: number;
}
/** World-space cell centre. Indices are row-major: depth * block.width + column. */
export function zoneCellCenter(block: ZoneBlock, index: number): Vec2 {
  const column = index % block.width,
    depth = Math.floor(index / block.width),
    n = { x: -block.dir.z * block.side, z: block.dir.x * block.side };
  return {
    x:
      block.origin.x +
      block.dir.x * column * CELL_SIZE +
      n.x * (depth + 0.5) * CELL_SIZE,
    z:
      block.origin.z +
      block.dir.z * column * CELL_SIZE +
      n.z * (depth + 0.5) * CELL_SIZE,
  };
}
/** Cell corners are always CCW regardless of which side of the road the block occupies. */
export function zoneCellPolygon(block: ZoneBlock, index: number): Vec2[] {
  const p = zoneCellCenter(block, index),
    u = block.dir,
    n = { x: -u.z, z: u.x },
    h = CELL_SIZE / 2;
  return [
    { x: p.x - u.x * h - n.x * h, z: p.z - u.z * h - n.z * h },
    { x: p.x + u.x * h - n.x * h, z: p.z + u.z * h - n.z * h },
    { x: p.x + u.x * h + n.x * h, z: p.z + u.z * h + n.z * h },
    { x: p.x - u.x * h + n.x * h, z: p.z - u.z * h + n.z * h },
  ];
}
function key(block: ZoneBlock, index: number): string {
  const p = zoneCellCenter(block, index);
  const round = (n: number) => Math.round(n / C.positionEpsilonM);
  return [
    round(p.x),
    round(p.z),
    round(block.dir.x),
    round(block.dir.z),
    block.side,
  ].join(',');
}
function at(points: RoadSample[], d: number): Vec2 {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    if (d <= b.distance)
      return lerp(a, b, (d - a.distance) / (b.distance - a.distance));
  }
  return points[points.length - 1]!;
}
function roadObstacles(
  w: ZoneGridWorld,
  samples: Map<number, RoadSample[]>,
): ZonePolygonIndex<number> {
  const index = new ZonePolygonIndex<number>();
  for (const s of w.segments) {
    const points = samples.get(s.id)!,
      half = ROADS[s.type].widthM / 2;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!,
        l = distance(a, b);
      if (l < C.positionEpsilonM) continue;
      const nx = (-(b.z - a.z) / l) * half,
        nz = ((b.x - a.x) / l) * half;
      index.add(
        [
          { x: a.x + nx, z: a.z + nz },
          { x: a.x - nx, z: a.z - nz },
          { x: b.x - nx, z: b.z - nz },
          { x: b.x + nx, z: b.z + nz },
        ],
        s.id,
      );
    }
  }
  for (const node of w.nodes) {
    const roads = w.segments.filter(
      (s) => s.start === node.id || s.end === node.id,
    );
    if (!roads.length) continue;
    const directions = roads.map((s) => {
      const p = samples.get(s.id)!;
      const a = s.start === node.id ? p[1]! : p[p.length - 2]!;
      return Math.atan2(a.z - node.pos.z, a.x - node.pos.x);
    });
    const straight =
      roads.length === 2 &&
      Math.abs(Math.abs(directions[0]! - directions[1]!) - Math.PI) <
        C.positionEpsilonM;
    if (straight) continue;
    // Circumscribed keep-out includes the rounded pavement corners, not just centreline crossings.
    const radius =
      (Math.max(...roads.map((s) => ROADS[s.type].widthM)) / 2 +
        (roads.length > 1 ? ROAD_MESH.cornerRadiusM : 0)) /
      Math.cos(Math.PI / C.junctionSides);
    const polygon = Array.from({ length: C.junctionSides }, (_, i) => ({
      x: node.pos.x + Math.cos((i * Math.PI * 2) / C.junctionSides) * radius,
      z: node.pos.z + Math.sin((i * Math.PI * 2) / C.junctionSides) * radius,
    }));
    index.add(polygon, -1);
  }
  return index;
}
/** Reconcile all road-owned blocks without mutating input; stable cells survive road splits. */
export function rebuildZoneGrid(w: ZoneGridWorld): ZoneGridChange {
  const nodes = new Map(w.nodes.map((n) => [n.id, n])),
    samples = new Map(
      w.segments.map((s) => [
        s.id,
        sampleRoad(s, nodes.get(s.start)!, nodes.get(s.end)!),
      ]),
    );
  const roadIndex = roadObstacles(w, samples),
    buildingIndex = new ZonePolygonIndex<number>();
  for (const b of w.buildings)
    buildingIndex.add(zoneBuildingFootprint(b), b.id);
  const oldCells = new Map<string, { zone: number; building: number }>();
  for (const b of [...w.zoneBlocks].sort(
    (a, b) => (a.createdOrder ?? a.id) - (b.createdOrder ?? b.id),
  ))
    for (let i = 0; i < b.cells.length; i++)
      if (b.cells[i] !== ZONE_CODES.invalid && !oldCells.has(key(b, i)))
        oldCells.set(key(b, i), {
          zone: b.cells[i]!,
          building: b.buildingAt[i]!,
        });
  const liveIds = new Set(w.segments.map((s) => s.id)),
    blocks: ZoneBlock[] = [],
    bySegment = new Map<number, ZoneBlock[]>();
  let nextId = w.nextId;
  for (const items of [w.nodes, w.segments, w.zoneBlocks, w.buildings])
    for (const item of items) nextId = Math.max(nextId, item.id + 1);
  const create = (
    s: RoadSegment,
    side: -1 | 1,
    origin: Vec2,
    dir: Vec2,
    width: number,
    ancestor?: ZoneBlock,
  ) => {
    const old = w.zoneBlocks.find(
      (b) =>
        b.segment === s.id &&
        b.side === side &&
        b.width === width &&
        distance(b.origin, origin) < C.positionEpsilonM &&
        distance(b.dir, dir) < C.positionEpsilonM,
    );
    const id = old?.id ?? nextId++,
      b: ZoneBlock = {
        id,
        segment: s.id,
        side,
        origin,
        dir,
        width,
        createdOrder:
          old?.createdOrder ?? ancestor?.createdOrder ?? ancestor?.id ?? id,
        cells: new Uint8Array(width * GROWTH.zoneDepthCells),
        buildingAt: new Int32Array(width * GROWTH.zoneDepthCells).fill(-1),
      };
    blocks.push(b);
    const list = bySegment.get(s.id) ?? [];
    list.push(b);
    bySegment.set(s.id, list);
  };
  for (const s of [...w.segments].sort(
    (a, b) => a.builtDay - b.builtDay || a.id - b.id,
  )) {
    if (s.elevated || ROADS[s.type].zoning === 'none') continue;
    const sampled = samples.get(s.id)!,
      total = sampled.at(-1)!.distance,
      points = s.zoningReversed
        ? [...sampled]
            .reverse()
            .map((p) => ({ ...p, distance: total - p.distance }))
        : sampled,
      start = points[0]!,
      end = points[points.length - 1]!,
      length = end.distance;
    if (length < CELL_SIZE - C.positionEpsilonM) continue;
    const chord = distance(start, end),
      straight =
        chord > C.positionEpsilonM &&
        closestPointOnSegment(s.c1, start, end).distance < C.positionEpsilonM &&
        closestPointOnSegment(s.c2, start, end).distance < C.positionEpsilonM;
    const half = ROADS[s.type].widthM / 2;
    for (const side of [-1, 1] as const) {
      if (straight) {
        const dir = {
            x: (end.x - start.x) / chord,
            z: (end.z - start.z) / chord,
          },
          normal = { x: -dir.z * side, z: dir.x * side };
        const ancestors = w.zoneBlocks
          .filter(
            (b) =>
              !liveIds.has(b.segment) &&
              b.side === side &&
              distance(b.dir, dir) < C.positionEpsilonM &&
              Math.abs(
                (b.origin.x - start.x - normal.x * half) * dir.z -
                  (b.origin.z - start.z - normal.z * half) * dir.x,
              ) < C.positionEpsilonM,
          )
          .filter((b) => {
            const d =
              (b.origin.x - start.x) * dir.x +
              (b.origin.z - start.z) * dir.z -
              CELL_SIZE / 2;
            return d < length && d + b.width * CELL_SIZE > 0;
          })
          .sort((a, b) => (a.createdOrder ?? a.id) - (b.createdOrder ?? b.id));
        const ancestor =
          w.zoneBlocks.find(
            (b) =>
              b.segment === s.id &&
              b.side === side &&
              distance(b.dir, dir) < C.positionEpsilonM,
          ) ?? ancestors[0];
        let offset = 0;
        if (ancestor) {
          const d =
            (ancestor.origin.x - start.x) * dir.x +
            (ancestor.origin.z - start.z) * dir.z -
            CELL_SIZE / 2;
          offset = ((d % CELL_SIZE) + CELL_SIZE) % CELL_SIZE;
          if (offset > CELL_SIZE - C.positionEpsilonM) offset = 0;
        }
        const width = Math.floor(
          (length - offset + C.positionEpsilonM) / CELL_SIZE,
        );
        if (width)
          create(
            s,
            side,
            {
              x: start.x + dir.x * (offset + CELL_SIZE / 2) + normal.x * half,
              z: start.z + dir.z * (offset + CELL_SIZE / 2) + normal.z * half,
            },
            dir,
            width,
            ancestor,
          );
      } else
        for (
          let d = 0;
          d + CELL_SIZE <= length + C.positionEpsilonM;
          d += CELL_SIZE * C.curveBlockWidth
        ) {
          const width = Math.min(
            C.curveBlockWidth,
            Math.floor((length - d + C.positionEpsilonM) / CELL_SIZE),
          );
          const span = width * CELL_SIZE;
          const a = at(points, d),
            b = at(points, d + span),
            l = distance(a, b);
          if (l < C.positionEpsilonM) continue;
          const dir = { x: (b.x - a.x) / l, z: (b.z - a.z) / l },
            middle = at(points, d + span / 2);
          const normal = { x: -dir.z * side, z: dir.x * side };
          // Place the straight front outside the full curved pavement over this block.
          let offset = half;
          for (let k = 0; k <= width; k++) {
            const p = at(points, d + k * CELL_SIZE);
            offset = Math.max(
              offset,
              half + (p.x - middle.x) * normal.x + (p.z - middle.z) * normal.z,
            );
          }
          create(
            s,
            side,
            {
              x:
                middle.x + normal.x * offset - (dir.x * (span - CELL_SIZE)) / 2,
              z:
                middle.z + normal.z * offset - (dir.z * (span - CELL_SIZE)) / 2,
            },
            dir,
            width,
          );
        }
    }
  }
  const accepted = new SpatialHash<number>(CELL_SIZE * 2),
    polygons: Polygon[] = [];
  for (const b of [...blocks].sort(
    (a, b) =>
      (a.createdOrder ?? a.id) - (b.createdOrder ?? b.id) || a.id - b.id,
  ))
    for (let i = 0; i < b.cells.length; i++) {
      const p = zoneCellPolygon(b, i),
        center = zoneCellCenter(b, i),
        old = oldCells.get(key(b, i));
      const valid =
        zoneTerrainValid(p, w.heights) &&
        !roadIndex.overlaps(p) &&
        !buildingIndex.overlaps(p, (id) => id === old?.building) &&
        !accepted
          .queryRadius(center, CELL_SIZE * Math.SQRT2)
          .some((id) => zonePolygonsOverlap(p, polygons[id]!));
      if (!valid) {
        b.cells[i] = ZONE_CODES.invalid;
        continue;
      }
      b.cells[i] = old?.zone ?? ZONE_CODES.none;
      b.buildingAt[i] = old?.building ?? -1;
      accepted.set(polygons.length, center);
      polygons.push(p);
    }
  const ids = new Set(blocks.map((b) => b.id));
  return {
    blocks,
    removed: w.zoneBlocks.filter((b) => !ids.has(b.id)).map((b) => b.id),
    segments: w.segments.map((s) => ({
      ...s,
      zoneBlockIds: (bySegment.get(s.id) ?? []).map((b) => b.id),
    })),
    nextId,
  };
}
