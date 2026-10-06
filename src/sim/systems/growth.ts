import { Rng } from '../../core/rng';
import { TIME } from '../../data/config';
import { GROWTH, ZONES, ZONE_CODES, type ZoneType } from '../../data/zones';
import { LotFinder } from '../../world/lots';
import type { Building, ZoneBlock } from '../../world/types';
import type { BuildingPatch } from '../../world/snapshot';
import type { SimState } from '../state';

/** Deterministic per-tick construction and zoning lifecycle; no wall-clock or renderer state. */
export class GrowthSystem {
  private finder?: LotFinder;
  private blocks?: SimState['zoneBlocks'];
  private roads?: SimState['segments'];
  private buildings?: SimState['buildings'];
  private owned?: SimState['ownedTiles'];
  private unlocked?: SimState['unlocked'];
  private terrainRevision = -1;
  /** Only explicit rezoning schedules removal; losing road access alone does not bulldoze a building. */
  zoningChanged(s: SimState): BuildingPatch[] {
    const byId = new Map(s.buildings.map((b) => [b.id, b]));
    const mismatch = new Set<number>(),
      present = new Set<number>();
    for (const block of s.zoneBlocks)
      block.buildingAt.forEach((id, i) => {
        const b = byId.get(id);
        if (!b || b.kind !== 'zoned') return;
        present.add(id);
        if (block.cells[i] !== ZONE_CODES[b.defId as ZoneType])
          mismatch.add(id);
      });
    const updated: BuildingPatch[] = [];
    for (const id of present) {
      const b = byId.get(id)!;
      if (mismatch.has(id) && b.rezoneAtTick === undefined) {
        b.rezoneAtTick =
          s.clock.ticks + GROWTH.rezoneDemolitionDays * TIME.ticksPerDay;
        updated.push({ id, rezoneAtTick: b.rezoneAtTick });
      } else if (!mismatch.has(id) && b.rezoneAtTick !== undefined) {
        b.rezoneAtTick = undefined;
        updated.push({ id, rezoneAtTick: undefined });
      }
    }
    return updated;
  }
  tick(s: SimState) {
    const added: Building[] = [],
      updated: BuildingPatch[] = [],
      removed: number[] = [],
      changedBlocks = new Set<ZoneBlock>();
    for (const b of s.buildings) {
      if (b.rezoneAtTick !== undefined && s.clock.ticks >= b.rezoneAtTick) {
        removed.push(b.id);
        continue;
      }
      if (b.state !== 'construction') continue;
      b.constructionStartedTick ??=
        s.clock.ticks - 1 - Math.round(b.stateTimer * TIME.ticksPerDay);
      const elapsed = s.clock.ticks - b.constructionStartedTick;
      if (elapsed >= GROWTH.constructionDays * TIME.ticksPerDay) {
        b.state = 'active';
        b.stateTimer = 0;
      } else b.stateTimer = Math.max(0, elapsed) / TIME.ticksPerDay;
      updated.push({
        id: b.id,
        state: b.state,
        stateTimer: b.stateTimer,
        constructionStartedTick: b.constructionStartedTick,
      });
    }
    if (removed.length) {
      const gone = new Set(removed);
      s.buildings = s.buildings.filter((b) => !gone.has(b.id));
      for (const block of s.zoneBlocks)
        block.buildingAt.forEach((id, i) => {
          if (gone.has(id)) {
            block.buildingAt[i] = -1;
            changedBlocks.add(block);
          }
        });
    }
    if (!s.zoneBlocks.length)
      return { added, updated, removed, blocks: [...changedBlocks] };
    if (
      !this.finder ||
      this.blocks !== s.zoneBlocks ||
      this.roads !== s.segments ||
      this.buildings !== s.buildings ||
      this.owned !== s.ownedTiles ||
      this.unlocked !== s.unlocked ||
      this.terrainRevision !== s.terrain.revision
    ) {
      this.finder = new LotFinder({
        ...s,
        heights: s.terrain.heights,
        mode: s.settings.mode,
      });
      this.blocks = s.zoneBlocks;
      this.roads = s.segments;
      this.buildings = s.buildings;
      this.owned = s.ownedTiles;
      this.unlocked = s.unlocked;
      this.terrainRevision = s.terrain.revision;
    }
    // A tick-derived stream makes replay/resume independent of frame rate or hidden RNG state.
    const rng = new Rng(s.seed ^ Math.imul(s.clock.ticks, 0x9e3779b1));
    const blockById = new Map(s.zoneBlocks.map((b) => [b.id, b]));
    for (const demand of ['R', 'C', 'I', 'O'] as const) {
      const value = s.stats.demand[demand];
      const attempts = Number.isFinite(value)
        ? Math.min(
            GROWTH.maxAttemptsPerTick,
            Math.max(0, Math.floor(value / GROWTH.demandPerAttempt)),
          )
        : 0;
      const zones = (Object.keys(ZONES) as ZoneType[]).filter(
        (z) => ZONES[z].demand === demand,
      );
      for (let attempt = 0; attempt < attempts; attempt++) {
        const area = zones.reduce((sum, z) => sum + this.finder!.area(z), 0);
        if (!area) break;
        let draw = rng.float(0, area),
          zone = zones[zones.length - 1]!;
        for (const candidate of zones) {
          draw -= this.finder.area(candidate);
          if (draw < 0) {
            zone = candidate;
            break;
          }
        }
        const lot = this.finder.find(zone, rng);
        if (!lot) continue;
        const id = s.nextId++;
        const b: Building = {
          id,
          kind: 'zoned',
          defId: zone,
          level: 1,
          pos: lot.pos,
          rotation: lot.rotation,
          lotW: lot.lotW,
          lotD: lot.lotD,
          seed: (s.seed + id) >>> 0,
          builtDay: s.clock.day,
          paidCost: 0,
          state: 'construction',
          stateTimer: 0,
          constructionStartedTick: s.clock.ticks,
          flags: 0,
          households: 0,
          residents: 0,
          jobs: 0,
          workers: 0,
          problemTimers: {
            noPower: 0,
            noWater: 0,
            noSewage: 0,
            noRoad: 0,
            noWorkers: 0,
            noCustomers: 0,
            noGoods: 0,
            garbage: 0,
            crime: 0,
            sickness: 0,
            fire: 0,
          },
          zoneBlock: lot.zoneBlock,
          blockCell: lot.blockCell,
        };
        const block = blockById.get(lot.zoneBlock)!;
        for (const cell of lot.cells) block.buildingAt[cell] = id;
        changedBlocks.add(block);
        s.buildings.push(b);
        this.finder.added(b);
        added.push(b);
      }
    }
    return { added, updated, removed, blocks: [...changedBlocks] };
  }
}
