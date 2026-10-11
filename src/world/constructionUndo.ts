import { GAME_MODES, UI_RULES, WORLD, MAP_SIZE } from '../data/config';
import { ROAD_RULES } from '../data/roads';
import type { Building, RoadNode, RoadSegment, ZoneBlock } from './types';
import type { NetworkSegment, WorldSnapshot } from './snapshot';
import { zoneCellCenter } from './zoneGrid';
import {
  polygonBounds,
  zoneBuildingFootprint,
  zonePolygonsOverlap,
} from './zoneGeometry';
export type UndoAction =
  | 'road'
  | 'upgrade'
  | 'zone'
  | 'place'
  | 'trees'
  | 'power'
  | 'water'
  | 'terrain'
  | 'rebuild';
type PhysicalWorld = Pick<
  WorldSnapshot,
  | 'nodes'
  | 'segments'
  | 'zoneBlocks'
  | 'buildings'
  | 'networks'
  | 'money'
  | 'clock'
  | 'settings'
> & { terrain: { heights: Float32Array } };
interface Change<T> {
  id: number;
  before?: T;
  after?: T;
}
interface Capture {
  nodes: RoadNode[];
  segments: RoadSegment[];
  zoneBlocks: ZoneBlock[];
  buildings: Building[];
  networks: { power: NetworkSegment[]; water: NetworkSegment[] };
  heights: Float32Array;
}
export interface ConstructionUndo {
  action: UndoAction;
  day: number;
  cost: number;
  rebuildId?: number;
  nodes: Change<RoadNode>[];
  segments: Change<RoadSegment>[];
  zones: Change<ZoneBlock>[];
  buildings: Change<Building>[];
  power: Change<NetworkSegment>[];
  water: Change<NetworkSegment>[];
  terrain: { index: number; before: number; after: number }[];
  knownBuildings: number[];
}
export interface UndoView {
  count: number;
  action?: UndoAction;
  day?: number;
  cost: number;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const segmentShape = (r: RoadSegment) => ({ ...r, zoneBlockIds: undefined });
const zoneShape = (b: ZoneBlock) => ({ ...b, buildingAt: undefined });
const buildingShape = (b: Building, rebuildId?: number) => ({
  id: b.id,
  kind: b.kind,
  defId: b.defId,
  pos: b.pos,
  rotation: b.rotation,
  lotW: b.lotW,
  lotD: b.lotD,
  frontageSetbackM: b.frontageSetbackM,
  builtDay: b.builtDay,
  paidCost: b.paidCost,
  ...(b.id === rebuildId
    ? { constructionStartedTick: b.constructionStartedTick }
    : {}),
});
function changes<T extends { id: number }>(
  before: T[],
  after: T[],
  shape: (v: T) => unknown = (v) => v,
): Change<T>[] {
  const old = new Map(before.map((v) => [v.id, v])),
    now = new Map(after.map((v) => [v.id, v]));
  return [...new Set([...old.keys(), ...now.keys()])].flatMap((id) => {
    const a = old.get(id),
      b = now.get(id);
    return equal(a && shape(a), b && shape(b))
      ? []
      : [{ id, before: a, after: b && structuredClone(b) }];
  });
}
export function captureConstruction(s: PhysicalWorld): Capture {
  return structuredClone({
    nodes: s.nodes,
    segments: s.segments,
    zoneBlocks: s.zoneBlocks,
    buildings: s.buildings,
    networks: s.networks,
    heights: s.terrain.heights,
  });
}
export function constructionChange(
  before: Capture,
  s: PhysicalWorld,
  action: UndoAction,
  cost: number,
  rebuildId?: number,
): ConstructionUndo | undefined {
  const entry: ConstructionUndo = {
    action,
    day: s.clock.day,
    cost: GAME_MODES[s.settings.mode].unlimitedMoney ? 0 : cost,
    rebuildId,
    nodes: changes(before.nodes, s.nodes),
    segments: changes(before.segments, s.segments, segmentShape),
    zones: changes(before.zoneBlocks, s.zoneBlocks, zoneShape),
    buildings: changes(before.buildings, s.buildings, (b) =>
      buildingShape(b, rebuildId),
    ),
    power: changes(before.networks.power, s.networks.power),
    water: changes(before.networks.water, s.networks.water),
    terrain: [],
    knownBuildings: before.buildings.map((b) => b.id),
  };
  for (let i = 0; i < before.heights.length; i++)
    if (before.heights[i] !== s.terrain.heights[i])
      entry.terrain.push({
        index: i,
        before: before.heights[i]!,
        after: s.terrain.heights[i]!,
      });
  return [
    entry.nodes,
    entry.segments,
    entry.zones,
    entry.buildings,
    entry.power,
    entry.water,
    entry.terrain,
  ].some((a) => a.length)
    ? entry
    : undefined;
}
export function undoRefund(
  e: Pick<ConstructionUndo, 'day' | 'cost'>,
  day: number,
): number {
  return day >= e.day && day - e.day < ROAD_RULES.refundDays ? e.cost : 0;
}
function compatible<T extends { id: number }>(
  items: T[],
  changes: Change<T>[],
  shape: (v: T) => unknown = (v) => v,
): boolean {
  const current = new Map(items.map((v) => [v.id, v]));
  return changes.every((c) => {
    const v = current.get(c.id);
    return equal(v && shape(v), c.after && shape(c.after));
  });
}
function reverse<T extends { id: number }>(
  items: T[],
  changes: Change<T>[],
  restore: (old: T, current: T | undefined) => T = (old) =>
    structuredClone(old),
): T[] {
  const map = new Map(items.map((v) => [v.id, v]));
  for (const c of changes) {
    if (c.before) map.set(c.id, restore(c.before, map.get(c.id)));
    else map.delete(c.id);
  }
  return [...map.values()];
}
/** Validate the entire inverse before mutating anything. Dynamic population, traffic and money are not snapshots. */
export function canUndoConstruction(
  s: PhysicalWorld,
  e: ConstructionUndo,
): boolean {
  if (
    !compatible(s.nodes, e.nodes) ||
    !compatible(s.segments, e.segments, segmentShape) ||
    !compatible(s.zoneBlocks, e.zones, zoneShape) ||
    !compatible(s.buildings, e.buildings, (b) =>
      buildingShape(b, e.rebuildId),
    ) ||
    !compatible(s.networks.power, e.power) ||
    !compatible(s.networks.water, e.water)
  )
    return false;
  if (e.terrain.some((p) => s.terrain.heights[p.index] !== p.after))
    return false;
  const known = new Set(e.knownBuildings),
    changing = new Set(e.buildings.map((b) => b.id));
  for (const c of e.buildings)
    if (c.before && !c.after) {
      const footprint = zoneBuildingFootprint(c.before);
      if (
        s.buildings.some(
          (b) =>
            !changing.has(b.id) &&
            zonePolygonsOverlap(footprint, zoneBuildingFootprint(b)),
        )
      )
        return false;
    }
  // A new structure on edited ground is a dependency: do not lower its foundations underneath it.
  for (const b of s.buildings)
    if (!known.has(b.id) && !changing.has(b.id)) {
      const bounds = polygonBounds(zoneBuildingFootprint(b));
      if (
        e.terrain.some((p) => {
          const x =
              (p.index % WORLD.heightmapVertices) * WORLD.heightmapSpacingM -
              MAP_SIZE / 2,
            z =
              Math.floor(p.index / WORLD.heightmapVertices) *
                WORLD.heightmapSpacingM -
              MAP_SIZE / 2;
          return (
            x >= bounds.minX - WORLD.heightmapSpacingM &&
            x <= bounds.maxX + WORLD.heightmapSpacingM &&
            z >= bounds.minZ - WORLD.heightmapSpacingM &&
            z <= bounds.maxZ + WORLD.heightmapSpacingM
          );
        })
      )
        return false;
    }
  return true;
}
/** Structural restoration only. A house displaced by a road upgrade returns empty, without resurrecting residents. */
function restoreBuilding(
  old: Building,
  current: Building | undefined,
  rebuildId?: number,
): Building {
  if (current) {
    const b = { ...current, ...structuredClone(buildingShape(old, rebuildId)) };
    if (old.id === rebuildId)
      Object.assign(b, {
        state: old.state,
        stateTimer: old.stateTimer,
        constructionStartedTick: old.constructionStartedTick,
        abandonedAtTick: old.abandonedAtTick,
        fire: structuredClone(old.fire),
      });
    return b;
  }
  const b = structuredClone(old);
  b.residents = b.workers = 0;
  b.housing = undefined;
  b.workerEducation = undefined;
  b.cargo = undefined;
  b.bodies = undefined;
  b.garbage = undefined;
  return b;
}
export function applyConstructionUndo(
  s: PhysicalWorld,
  e: ConstructionUndo,
): void {
  const occupancy = new Map<string, number>();
  const key = (b: ZoneBlock, i: number) => {
    const p = zoneCellCenter(b, i);
    return `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
  };
  for (const b of s.zoneBlocks)
    b.buildingAt.forEach((id, i) => {
      if (id > 0) occupancy.set(key(b, i), id);
    });
  s.nodes = reverse(s.nodes, e.nodes);
  s.segments = reverse(s.segments, e.segments, (old, current) => ({
    ...structuredClone(old),
    zoneBlockIds: current?.zoneBlockIds ?? old.zoneBlockIds,
  }));
  s.buildings = reverse(s.buildings, e.buildings, (old, current) =>
    restoreBuilding(old, current, e.rebuildId),
  );
  s.zoneBlocks = reverse(s.zoneBlocks, e.zones);
  const live = new Set(s.buildings.map((b) => b.id));
  for (const b of s.zoneBlocks)
    b.buildingAt = Int32Array.from(b.buildingAt, (id, i) => {
      const current = occupancy.get(key(b, i));
      return current && live.has(current) ? current : live.has(id) ? id : -1;
    });
  s.networks = {
    power: reverse(s.networks.power, e.power),
    water: reverse(s.networks.water, e.water),
  };
  for (const p of e.terrain) s.terrain.heights[p.index] = p.before;
  s.money += undoRefund(e, s.clock.day);
}
export class ConstructionHistory {
  private entries: ConstructionUndo[] = [];
  push(e: ConstructionUndo) {
    this.entries.push(e);
    if (this.entries.length > UI_RULES.undoActions) this.entries.shift();
  }
  get latest() {
    return this.entries.at(-1);
  }
  pop() {
    return this.entries.pop();
  }
  view(): UndoView {
    const e = this.latest;
    return {
      count: this.entries.length,
      action: e?.action,
      day: e?.day,
      cost: e?.cost ?? 0,
    };
  }
}
