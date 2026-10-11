import { cityStatistics } from '../world/cityStatistics';
import { savedRoadTraffic, type RoadTraffic } from '../world/roadTraffic';
import { financeHistory } from '../world/financeHistory';
import { districtViews, type DistrictView } from '../world/districts';
import { busLineViews, type BusLineView } from '../world/transit';
import type { VegetationWorld } from '../world/vegetation';
import type { SimSpeed } from '../data/config';
import type { PowerWorld } from '../world/power';
import type { CityStats } from '../world/types';
import type { BulldozeWorld } from '../world/bulldoze';
import type { RoadConstructionWorld } from '../world/roadConstruction';
import type { SimClock, WorldSnapshot, FinanceView } from '../world/snapshot';
import type { Building, ServiceType, ZoneBlock } from '../world/types';
import type { SimEvent } from './protocol';

function upsert<T extends { id: number }>(
  old: T[],
  added: T[],
  removed: number[],
): T[] {
  const map = new Map(old.map((item) => [item.id, item]));
  for (const id of removed) map.delete(id);
  for (const item of added) map.set(item.id, item);
  return [...map.values()];
}

/** Read-only public view; all snapshots and incoming mutable data are copied. */
export class WorldMirror {
  private state: WorldSnapshot | undefined;
  private districts: DistrictView[] = [];
  private roadTraffic: RoadTraffic[] = [];
  readCityStatistics() {
    return (
      this.state &&
      cityStatistics(this.state.buildings, this.state.stats, this.roadTraffic)
    );
  }
  readPolicies() {
    return (
      this.state &&
      structuredClone({
        policies: this.state.policies,
        districts: this.state.districts,
        unlocked: this.state.unlocked,
        sandbox: this.state.settings.mode === 'sandbox',
      })
    );
  }
  readTileWorld() {
    const s = this.state;
    return (
      s && {
        ownedTiles: [...s.ownedTiles],
        unlocked: [...s.unlocked],
        tileLimit: s.tileLimit,
        money: s.money,
        settings: { mode: s.settings.mode },
      }
    );
  }
  readOwnedTiles(): number[] {
    return [...(this.state?.ownedTiles ?? [])];
  }
  readDistricts() {
    return structuredClone(this.districts);
  }
  private busLines: BusLineView[] = [];
  readTransit(): BusLineView[] {
    return structuredClone(this.busLines);
  }
  private vehicles: {
    data: Float32Array;
    count: number;
    tick?: number;
    speed?: SimSpeed;
  } = { data: new Float32Array(), count: 0 };

  /** Return an inexpensive frozen clock; undefined until ready. */
  get clock(): Readonly<SimClock> | undefined {
    return this.state && Object.freeze({ ...this.state.clock });
  }

  /** Read city identity without cloning terrain or other world arrays. */
  get cityName(): string | undefined {
    return this.state?.settings.cityName;
  }

  get gameOver(): boolean {
    return this.state?.economy.status === 'gameOver';
  }

  readStats(): CityStats | undefined {
    return this.state && structuredClone(this.state.stats);
  }

  readFinanceHistory() {
    return this.state
      ? financeHistory(this.state.statsHistory, this.state.clock.day)
      : [];
  }

  readFinance(): FinanceView | undefined {
    const s = this.state;
    return (
      s &&
      structuredClone({
        money: s.money,
        loans: s.loans,
        taxRates: s.taxRates,
        budgets: s.budgets,
        economy: s.economy,
        unlocked: s.unlocked,
        sandbox: s.settings.mode === 'sandbox',
      })
    );
  }

  /** Request a defensive full snapshot, outside the render loop. */
  readDisasters() {
    return structuredClone(this.state?.disasters);
  }

  readSnapshot(): WorldSnapshot | undefined {
    return this.state && structuredClone(this.state);
  }

  /** Copy only data needed by construction tools; cache it until a world event changes it. */
  readRoadWorld(): RoadConstructionWorld | undefined {
    const s = this.state;
    return (
      s &&
      structuredClone({
        nodes: s.nodes,
        segments: s.segments,
        nextId: s.nextId,
        heights: s.terrain.heights,
        buildings: s.buildings,
        ownedTiles: s.ownedTiles,
        money: s.money,
        mode: s.settings.mode,
        unlocked: s.unlocked,
      })
    );
  }

  readPowerWorld(net: 'power' | 'water' = 'power'): PowerWorld | undefined {
    const road = this.readRoadWorld();
    return road && this.state
      ? {
          ...road,
          seed: this.state.seed,
          networks: structuredClone(this.state.networks[net]),
        }
      : undefined;
  }

  /** Cache the demolition view between world events, without fields or stats history. */
  readBulldozeWorld(): BulldozeWorld | undefined {
    const s = this.state;
    return (
      s &&
      structuredClone({
        nodes: s.nodes,
        segments: s.segments,
        zoneBlocks: s.zoneBlocks,
        buildings: s.buildings,
        networks: s.networks,
        heights: s.terrain.heights,
        nextId: s.nextId,
        day: s.clock.day,
        mode: s.settings.mode,
      })
    );
  }

  /** Copy road-owned zoning blocks without cloning unrelated world arrays. */
  readZoneBlocks(): ZoneBlock[] {
    return this.state ? structuredClone(this.state.zoneBlocks) : [];
  }

  /** Minimal defensive visual occupancy snapshot; no terrain or simulation fields copied. */
  readVegetationWorld(): VegetationWorld | undefined {
    const s = this.state;
    return (
      s &&
      structuredClone({
        nodes: s.nodes,
        segments: s.segments,
        buildings: s.buildings.map((b) => ({
          pos: b.pos,
          rotation: b.rotation,
          lotW: b.lotW,
          lotD: b.lotD,
          defId: b.defId,
        })),
      })
    );
  }

  /** Building render initialization without copying terrain and simulation fields. */
  readBuildings(): Building[] {
    return this.state ? structuredClone(this.state.buildings) : [];
  }

  /** Return the latest copied vehicle stream (M2). */
  readVehicles(): {
    data: Float32Array;
    count: number;
    tick?: number;
    speed?: SimSpeed;
  } {
    return structuredClone(this.vehicles);
  }

  /** Apply worker messages before notifying UI subscribers. */
  apply(event: SimEvent): void {
    if (event.t === 'ready') {
      this.state = structuredClone(event.snapshot);
      this.roadTraffic = savedRoadTraffic(
        event.snapshot.segments,
        event.snapshot.traffic,
      );
      this.busLines = busLineViews(event.snapshot.transitLines);
      this.districts = districtViews(
        event.snapshot.districts,
        event.snapshot.buildings,
      );
      this.vehicles = { data: new Float32Array(), count: 0 };
      return;
    }
    const state = this.state;
    if (!state) return;
    switch (event.t) {
      case 'roadTraffic':
        this.roadTraffic = structuredClone(event.roads);
        break;
      case 'disasters':
        state.disasters = structuredClone(event.state);
        break;
      case 'policies':
        state.policies = [...event.policies];
        break;
      case 'districts':
        this.districts = structuredClone(event.districts);
        state.districts = this.districts.map(
          ({ id, name, cells, policies, industry }) => ({
            ...(industry ? { industry } : {}),
            ...(policies ? { policies } : {}),
            id,
            name,
            cells,
          }),
        );
        break;
      case 'economy': {
        const finance = structuredClone(event.finance);
        state.money = finance.money;
        state.loans = finance.loans;
        state.taxRates = finance.taxRates;
        state.budgets = finance.budgets;
        state.economy = finance.economy;
        state.unlocked = finance.unlocked;
        state.stats.money = finance.money;
        break;
      }
      case 'clock':
        state.clock = { ...event.clock };
        break;
      case 'fundsChanged':
        state.money = state.stats.money = event.money;
        break;
      case 'roadsChanged':
        this.roadTraffic = this.roadTraffic.filter(
          (r) => !event.removed.includes(r.id),
        );
        if (event.terrain) {
          event.terrain.indices.forEach((index, i) => {
            state.terrain.heights[index] = event.terrain!.heights[i]!;
          });
          state.terrain.revision = event.terrain.revision;
        }
        for (const item of [...event.added, ...event.nodes])
          state.nextId = Math.max(state.nextId, item.id + 1);
        state.segments = upsert(
          state.segments,
          structuredClone(event.added),
          event.removed,
        );
        state.nodes = upsert(
          state.nodes,
          structuredClone(event.nodes),
          event.removedNodes,
        );
        break;
      case 'transit':
        this.busLines = structuredClone(event.lines);
        break;
      case 'zonesChanged':
        for (const block of event.blocks)
          state.nextId = Math.max(state.nextId, block.id + 1);
        state.zoneBlocks = upsert(
          state.zoneBlocks,
          structuredClone(event.blocks),
          event.removed,
        );
        break;
      case 'buildingsChanged': {
        for (const b of event.added)
          state.nextId = Math.max(state.nextId, b.id + 1);
        const patches = new Map(
          event.updated.map((p) => [p.id, structuredClone(p)]),
        );
        state.buildings = upsert(
          state.buildings,
          structuredClone(event.added),
          event.removed,
        ).map((b) => ({ ...b, ...patches.get(b.id) }));
        break;
      }
      case 'networksChanged':
        for (const n of event.added)
          state.nextId = Math.max(state.nextId, n.id + 1);
        state.networks[event.net] = upsert(
          state.networks[event.net],
          structuredClone(event.added),
          event.removed,
        );
        break;
      case 'stats':
        state.money = event.stats.money;
        state.stats = structuredClone(event.stats);
        if (!event.transient)
          state.statsHistory.push(structuredClone(event.stats));
        break;
      case 'fields':
        if (event.which.startsWith('coverage.'))
          state.fields.coverage[
            event.which.slice('coverage.'.length) as ServiceType
          ] = event.data.slice();
        else
          state.fields[
            event.which as
              'pollution' | 'noise' | 'landValue' | 'waterPollution'
          ] = event.data.slice();
        break;
      case 'vehicles':
        this.vehicles = {
          data: event.data.slice(),
          count: event.count,
          tick: event.tick,
          speed: event.speed,
        };
        break;
      case 'tilesChanged':
        state.ownedTiles = [...event.ownedTiles];
        break;
      case 'milestone':
        state.stats.milestone = Math.max(state.stats.milestone, event.index);
        if (!state.unlocked.includes(event.index))
          state.unlocked.push(event.index);
        break;
    }
  }
}
