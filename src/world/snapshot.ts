import type { TrafficState } from './traffic';
import type { CitizenTable } from './citizens';
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
  starterRoads?: boolean;
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
  startHeight?: number;
  endHeight?: number;
}
export interface NetworkSegment {
  id: Id;
  builtDay?: number;
  paidCost?: number;
  points: Vec2[];
}
export type NetworkKind = 'power' | 'water';
export type BuildingPatch = Pick<Building, 'id'> &
  Partial<Omit<Building, 'id'>>;
export type FieldName =
  | Exclude<keyof Fields, 'size' | 'coverage'>
  | `coverage.${keyof Fields['coverage']}`;
export type InspectInfo =
  | { kind: 'vehicle'; value: import('./traffic').TrafficInfo }
  | { kind: 'building'; value: Building }
  | { kind: 'segment'; value: RoadSegment }
  | { kind: 'network'; net: NetworkKind; value: NetworkSegment };

export interface EconomyState {
  distressWeeks: number;
  status: 'normal' | 'warning' | 'gameOver';
  settledWeek: number;
  taxIncome: Record<ZoneType, number>;
  upkeep: Record<BudgetDepartment, number>;
  debtPayment: number;
}
export type FinanceView = Pick<
  WorldSnapshot,
  'money' | 'loans' | 'taxRates' | 'budgets' | 'economy' | 'unlocked'
> & { sandbox: boolean };

/** Structured-clone wire format, never a reference to the authoritative state. */
export interface WorldSnapshot {
  cargo: import('./cargo').CargoState;
  seed: number;
  settings: CitySettings;
  clock: SimClock;
  money: number;
  economy: EconomyState;
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
  citizens: CitizenTable;
  traffic: TrafficState;
  transitLines: never[];
  districts: never[];
  policies: PolicyId[];
  unlocked: number[];
  stats: CityStats;
  statsHistory: CityStats[];
  nextId: Id;
}
