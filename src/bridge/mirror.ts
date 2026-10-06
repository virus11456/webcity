import type { RoadConstructionWorld } from '../world/roadConstruction';
import type { SimClock, WorldSnapshot } from '../world/snapshot';
import type { ServiceType, ZoneBlock } from '../world/types';
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
  private vehicles = { data: new Float32Array(), count: 0 };

  /** Return an inexpensive frozen clock; undefined until ready. */
  get clock(): Readonly<SimClock> | undefined {
    return this.state && Object.freeze({ ...this.state.clock });
  }

  /** Request a defensive full snapshot, outside the render loop. */
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

  /** Copy road-owned zoning blocks without cloning unrelated world arrays. */
  readZoneBlocks(): ZoneBlock[] {
    return this.state ? structuredClone(this.state.zoneBlocks) : [];
  }

  /** Return the latest copied vehicle stream (M2). */
  readVehicles(): { data: Float32Array; count: number } {
    return structuredClone(this.vehicles);
  }

  /** Apply worker messages before notifying UI subscribers. */
  apply(event: SimEvent): void {
    if (event.t === 'ready') {
      this.state = structuredClone(event.snapshot);
      this.vehicles = { data: new Float32Array(), count: 0 };
      return;
    }
    const state = this.state;
    if (!state) return;
    switch (event.t) {
      case 'clock':
        state.clock = { ...event.clock };
        break;
      case 'fundsChanged':
        state.money = state.stats.money = event.money;
        break;
      case 'roadsChanged':
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
        state.networks[event.net] = upsert(
          state.networks[event.net],
          structuredClone(event.added),
          event.removed,
        );
        break;
      case 'stats':
        state.money = event.stats.money;
        state.stats = structuredClone(event.stats);
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
        this.vehicles = { data: event.data.slice(), count: event.count };
        break;
      case 'milestone':
        if (!state.unlocked.includes(event.index))
          state.unlocked.push(event.index);
        break;
    }
  }
}
