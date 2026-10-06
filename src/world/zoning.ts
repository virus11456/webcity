import {
  GAME_MODES,
  MAP_SIZE,
  MAP_TILES,
  TILE_SIZE,
  type GameMode,
} from '../data/config';
import { ROADS } from '../data/roads';
import { ZONE_TOOL } from '../data/zoneTool';
import { ZONES, ZONE_CODES } from '../data/zones';
import { zoneCellPolygon } from './zoneGrid';
import { polygonBounds, zonePolygonsOverlap } from './zoneGeometry';
import type { Id, RoadSegment, ZoneBlock, ZoneType } from './types';

export type ZoneCell = [Id, number];
export type ZoningReason =
  | 'err.zoneLocked'
  | 'err.zoneCell'
  | 'err.zoneLand'
  | 'err.zoneRoad'
  | 'err.zoneOccupied'
  | 'err.zoneLimit';
export interface ZoningWorld {
  zoneBlocks: readonly ZoneBlock[];
  segments: readonly RoadSegment[];
  ownedTiles: readonly number[];
  unlocked: readonly number[];
  mode: GameMode;
}
/** Narrow untrusted worker input before looking up any cell. */
export function isZonePayload(
  cells: unknown,
  zone: unknown,
): cells is ZoneCell[] {
  return (
    (zone === null ||
      (typeof zone === 'string' && Object.hasOwn(ZONES, zone))) &&
    Array.isArray(cells) &&
    cells.length > 0 &&
    cells.length <= ZONE_TOOL.maxCellsPerCommand &&
    cells.every(
      (c) =>
        Array.isArray(c) &&
        c.length === 2 &&
        Number.isSafeInteger(c[0]) &&
        c[0] > 0 &&
        Number.isSafeInteger(c[1]) &&
        c[1] >= 0,
    )
  );
}
/** Whole cell ownership, including a rotated cell crossing an unowned tile corner. */
export function zoneCellOwned(
  block: ZoneBlock,
  index: number,
  tiles: readonly number[],
): boolean {
  const polygon = zoneCellPolygon(block, index),
    b = polygonBounds(polygon);
  if (
    b.minX < -MAP_SIZE / 2 ||
    b.maxX > MAP_SIZE / 2 ||
    b.minZ < -MAP_SIZE / 2 ||
    b.maxZ > MAP_SIZE / 2
  )
    return false;
  for (
    let z = Math.max(0, Math.floor((b.minZ + MAP_SIZE / 2) / TILE_SIZE));
    z <=
    Math.min(MAP_TILES - 1, Math.floor((b.maxZ + MAP_SIZE / 2) / TILE_SIZE));
    z++
  )
    for (
      let x = Math.max(0, Math.floor((b.minX + MAP_SIZE / 2) / TILE_SIZE));
      x <=
      Math.min(MAP_TILES - 1, Math.floor((b.maxX + MAP_SIZE / 2) / TILE_SIZE));
      x++
    ) {
      if (tiles.includes(z * MAP_TILES + x)) continue;
      const px = x * TILE_SIZE - MAP_SIZE / 2,
        pz = z * TILE_SIZE - MAP_SIZE / 2;
      if (
        zonePolygonsOverlap(polygon, [
          { x: px, z: pz },
          { x: px + TILE_SIZE, z: pz },
          { x: px + TILE_SIZE, z: pz + TILE_SIZE },
          { x: px, z: pz + TILE_SIZE },
        ])
      )
        return false;
    }
  return true;
}
export function zoneRoadAllows(
  road: RoadSegment | undefined,
  zone: ZoneType | null,
): boolean {
  if (!road || road.elevated || ROADS[road.type].zoning === 'none')
    return false;
  return (
    zone === null ||
    ROADS[road.type].zoning === 'all' ||
    zone === 'RL' ||
    zone === 'CL'
  );
}
/** Validate the complete batch first, then return copies of changed blocks; never partially apply. */
export function paintZones(
  world: ZoningWorld,
  cells: ZoneCell[],
  zone: ZoneType | null,
): { blocks: ZoneBlock[]; reason: ZoningReason | 'err.invalidCommand' | null } {
  const fail = (reason: ZoningReason | 'err.invalidCommand') => ({
    blocks: [],
    reason,
  });
  if (!isZonePayload(cells, zone)) return fail('err.invalidCommand');
  if (
    zone &&
    !GAME_MODES[world.mode].allUnlocked &&
    !world.unlocked.includes(ZONES[zone].unlock)
  )
    return fail('err.zoneLocked');
  const blocks = new Map(world.zoneBlocks.map((b) => [b.id, b])),
    roads = new Map(world.segments.map((r) => [r.id, r]));
  const code = zone === null ? ZONE_CODES.none : ZONE_CODES[zone];
  for (const [id, index] of cells) {
    const b = blocks.get(id);
    if (!b || index >= b.cells.length || b.cells[index] === ZONE_CODES.invalid)
      return fail('err.zoneCell');
    if (!zoneCellOwned(b, index, world.ownedTiles)) return fail('err.zoneLand');
    if (!zoneRoadAllows(roads.get(b.segment), zone))
      return fail('err.zoneRoad');
    // Growth / timed demolition is introduced in M1-12; do not corrupt occupied lots meanwhile.
    if (b.buildingAt[index] !== -1 && b.cells[index] !== code)
      return fail('err.zoneOccupied');
  }
  const changed = new Map<Id, ZoneBlock>();
  for (const [id, index] of cells) {
    const b = blocks.get(id)!;
    if (b.cells[index] === code) continue;
    if (!changed.has(id)) changed.set(id, structuredClone(b));
    changed.get(id)!.cells[index] = code;
  }
  return { blocks: [...changed.values()], reason: null };
}
