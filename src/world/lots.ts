import { Rng } from '../core/rng';
import { CELL_SIZE, GAME_MODES, type GameMode } from '../data/config';
import { GROWTH, ZONES, ZONE_CODES, type ZoneType } from '../data/zones';
import { zoneCellOwned, zoneRoadAllows } from './zoning';
import {
  ZonePolygonIndex,
  zoneBuildingFootprint,
  zoneTerrainValid,
} from './zoneGeometry';
import type { Building, RoadSegment, Vec2, ZoneBlock } from './types';

export interface LotWorld {
  zoneBlocks: readonly ZoneBlock[];
  segments: readonly RoadSegment[];
  buildings: readonly Building[];
  heights: Float32Array;
  ownedTiles: readonly number[];
  unlocked: readonly number[];
  mode: GameMode;
}
export interface Lot {
  zone: ZoneType;
  zoneBlock: number;
  blockCell: number;
  cells: number[];
  lotW: number;
  lotD: number;
  pos: Vec2;
  rotation: number;
}
/** Front-centre origin. World rotation follows the existing collision convention: depth is +local Z. */
export function lotPlacement(block: ZoneBlock, column: number, width: number) {
  const along = (column + (width - 1) / 2) * CELL_SIZE;
  return {
    pos: {
      x: block.origin.x + block.dir.x * along,
      z: block.origin.z + block.dir.z * along,
    },
    rotation: Math.atan2(-block.dir.z * block.side, block.dir.x * block.side),
  };
}
/** Read-only world lookup plus a private spatial cache. Occupancy remains authoritative in the Worker. */
export class LotFinder {
  private readonly candidates = new Map<
    ZoneType,
    { block: ZoneBlock; column: number }[]
  >();
  private readonly areas = new Map<ZoneType, number>();
  private readonly buildings = new ZonePolygonIndex<number>();
  private readonly terrain = new Map<string, boolean>();
  constructor(private readonly world: LotWorld) {
    const roads = new Map(world.segments.map((r) => [r.id, r]));
    for (const zone of Object.keys(ZONES) as ZoneType[]) {
      const candidates: { block: ZoneBlock; column: number }[] = [];
      let area = 0;
      if (
        GAME_MODES[world.mode].allUnlocked ||
        world.unlocked.includes(ZONES[zone].unlock)
      )
        for (const block of world.zoneBlocks) {
          if (!zoneRoadAllows(roads.get(block.segment), zone)) continue;
          for (let i = 0; i < block.cells.length; i++)
            if (
              block.cells[i] === ZONE_CODES[zone] &&
              block.buildingAt[i] === -1 &&
              zoneCellOwned(block, i, world.ownedTiles)
            ) {
              area++;
              if (i < block.width) candidates.push({ block, column: i });
            }
        }
      this.candidates.set(zone, candidates);
      this.areas.set(zone, area);
    }
    for (const b of world.buildings)
      this.buildings.add(zoneBuildingFootprint(b), b.id);
  }
  /** Available zoned area weights the shared residential/commercial demand budget. */
  area(zone: ZoneType): number {
    return this.candidates.get(zone)!.length ? this.areas.get(zone)! : 0;
  }
  find(zone: ZoneType, rng: Rng): Lot | null {
    const candidates = this.candidates.get(zone)!;
    // Remove occupied frontage lazily; a failed attempt never loops over every possible lot.
    while (candidates.length) {
      const index = rng.int(0, candidates.length - 1),
        anchor = candidates[index]!;
      if (
        anchor.block.buildingAt[anchor.column] !== -1 ||
        anchor.block.cells[anchor.column] !== ZONE_CODES[zone]
      ) {
        candidates[index] = candidates[candidates.length - 1]!;
        candidates.pop();
        continue;
      }
      const rules = ZONES[zone],
        legal: Lot[] = [];
      for (let w = rules.lotWidthCells[0]; w <= rules.lotWidthCells[1]; w++)
        for (
          let left = Math.max(0, anchor.column - w + 1);
          left <= anchor.column && left + w <= anchor.block.width;
          left++
        )
          for (
            let d = rules.lotDepthCells[0];
            d <= rules.lotDepthCells[1];
            d++
          ) {
            const lot = this.rectangle(anchor.block, left, w, d, zone);
            if (lot) legal.push(lot);
          }
      if (legal.length) return rng.pick(legal);
      // Terrain/shape cannot become valid until a topology/zoning revision reconstructs this finder.
      candidates[index] = candidates[candidates.length - 1]!;
      candidates.pop();
      return null;
    }
    return null;
  }
  private rectangle(
    block: ZoneBlock,
    column: number,
    w: number,
    d: number,
    zone: ZoneType,
  ): Lot | null {
    const cells: number[] = [];
    for (let z = 0; z < d; z++)
      for (let x = column; x < column + w; x++) {
        const index = z * block.width + x;
        if (
          block.cells[index] !== ZONE_CODES[zone] ||
          block.buildingAt[index] !== -1 ||
          !zoneCellOwned(block, index, this.world.ownedTiles)
        )
          return null;
        cells.push(index);
      }
    const placement = lotPlacement(block, column, w);
    const shape = { ...placement, lotW: w, lotD: d };
    const polygon = zoneBuildingFootprint(shape);
    const key = `${block.id}:${column}:${w}:${d}`;
    let valid = this.terrain.get(key);
    if (valid === undefined) {
      valid = zoneTerrainValid(
        polygon,
        this.world.heights,
        GROWTH.maxSlopeExclusive,
        true,
      );
      this.terrain.set(key, valid);
    }
    if (!valid || this.buildings.overlaps(polygon)) return null;
    return {
      zone,
      zoneBlock: block.id,
      blockCell: column,
      cells,
      lotW: w,
      lotD: d,
      ...placement,
    };
  }
  /** Called after the Worker occupies a lot; only this acceleration structure is modified. */
  added(building: Building): void {
    this.buildings.add(zoneBuildingFootprint(building), building.id);
    const zone = building.defId as ZoneType;
    this.areas.set(
      zone,
      Math.max(0, this.areas.get(zone)! - building.lotW * building.lotD),
    );
  }
}
