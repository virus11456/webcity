import type { GameMode, SimSpeed } from '../data/config';
import type { BudgetDepartment } from '../data/economy';
import type { PolicyId } from '../data/policies';
import type {
  Building,
  CityStats,
  Fields,
  Id,
  RoadNode,
  RoadSegment,
  Vec2,
  ZoneBlock,
  ZoneType,
} from './types';

export interface CitySettings {
  seed: number;
  mapId: string;
  mode: GameMode;
  cityName: string;
}
export interface SimClock {
  day: number;
  tickInDay: number;
  ticks: number;
  speed: SimSpeed;
}
/** Ordered cubic road draft; worker validates geometry when M1-05 lands. */
export interface RoadDraft {
  start: Vec2;
  c1: Vec2;
  c2: Vec2;
  end: Vec2;
  elevated: boolean;
}
export interface NetworkSegment {
  id: Id;
  points: Vec2[];
}
export type NetworkKind = 'power' | 'water';
export type BuildingPatch = Pick<Building, 'id'> &
  Partial<Omit<Building, 'id'>>;
export type FieldName =
  | Exclude<keyof Fields, 'size' | 'coverage'>
  | `coverage.${keyof Fields['coverage']}`;
export type InspectInfo =
  | { kind: 'building'; value: Building }
  | { kind: 'segment'; value: RoadSegment }
  | { kind: 'network'; net: NetworkKind; value: NetworkSegment };

/** Structured-clone wire format, never a reference to the authoritative state. */
export interface WorldSnapshot {
  seed: number;
  settings: CitySettings;
  clock: SimClock;
  money: number;
  loans: { bank: number; remaining: number; weeksLeft: number }[];
  taxRates: Record<ZoneType, number>;
  budgets: Record<BudgetDepartment, number>;
  terrain: {
    heights: Float32Array;
    river: Float32Array;
    riverWidth: number;
    revision: number;
    resources: Record<'fertile' | 'forest' | 'ore' | 'oil', Uint8Array>;
  };
  ownedTiles: number[];
  nodes: RoadNode[];
  segments: RoadSegment[];
  zoneBlocks: ZoneBlock[];
  buildings: Building[];
  networks: Record<NetworkKind, NetworkSegment[]>;
  fields: Fields;
  // Reserved empty collections; concrete schemas belong to M2 / M4.
  citizens: never[];
  transitLines: never[];
  districts: never[];
  policies: PolicyId[];
  unlocked: number[];
  stats: CityStats;
  statsHistory: CityStats[];
  nextId: Id;
}
