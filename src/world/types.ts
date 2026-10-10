import type { RoadTypeId } from '../data/roads';
import type { ProblemType } from '../data/simulation';
import type { ServiceType } from '../data/buildings';
import type { ZoneType } from '../data/zones';
export type { ProblemType, ServiceType, ZoneType };

// TECH §4. Mutable state belongs to the simulation worker.
export type Id = number;
export interface Vec2 {
  x: number;
  z: number;
} // 世界座標（公尺），y 為高度

// ── 道路圖 ──
export interface RoadNode {
  id: Id;
  pos: Vec2;
  height: number; // 節點高度（地形或高架）
  segments: Id[]; // 相連路段
  control: 'none' | 'lights' | 'stop';
  manualControl?: boolean;
  banLeft?: boolean;
}
export interface RoadSegment {
  regional?: boolean; // Prefabricated highway beyond the initial city; region pays upkeep.
  id: Id;
  type: RoadTypeId; // data/roads.ts 的 key
  start: Id;
  end: Id; // 節點 id
  c1: Vec2;
  c2: Vec2; // 三次貝茲控制點（直線時 = 端點三等分點）
  length: number;
  elevated: boolean;
  builtDay: number; // 用於 7 天內全額退款
  paidCost?: number; // Actual paid cost, apportioned exactly when roads split.
  zoningReversed?: boolean; // Keep physical lot orientation when traffic direction flips.
  zoneBlockIds: Id[];
}

// ── 分區格 ──
// 每個 ZoneBlock = 某路段某一側的一排格子，寬 n 格 × 深 4 格
export interface ZoneBlock {
  id: Id;
  createdOrder?: Id; // Original block ID, preserved through road splits for overlap priority.
  segment: Id;
  side: -1 | 1;
  origin: Vec2; // 第一格的前緣中心
  dir: Vec2; // 沿路方向（單位向量）；曲線路段會切成多個 block
  width: number; // 沿路格數
  cells: Uint8Array; // width × 4，值 = ZoneCode（0 無、1 RL…6 O、255 無效）
  buildingAt: Int32Array; // width × 4，建築 id 或 -1
}

// ── 建築 ──
export type EducationCounts = [number, number, number, number];
export interface HousingPopulation {
  sizes: [number, number, number, number, number];
  occupied: number;
  education: EducationCounts;
  ages: EducationCounts;
  averageEducation: number;
  availableWorkers: EducationCounts;
  employed: number;
  lastMigrationDay?: number;
  assignments: {
    workplaceId: Id;
    education: number;
    requiredEducation: number;
    workers: number;
  }[];
}
export interface PopulationDetails {
  day: number;
  households: number;
  occupiedHouseholds: number;
  availableWorkers: number;
  employed: number;
  unemployed: number;
  jobs: number;
  vacancies: number;
  movedIn: number;
  movedOut: number;
}
export interface Building {
  frontageSetbackM?: number; // Retained driveway after road narrowing.
  id: Id;
  kind: 'zoned' | 'service' | 'park' | 'utility' | 'unique';
  builtDay?: number;
  paidCost?: number;
  roadDisconnectedDay?: number; // Undefined means no demolition-induced access problem.
  defId: string; // zoned 為 zone（如 'RL'），其他為 data/buildings.ts 的 id
  level: number; // 1～5
  pos: Vec2;
  rotation: number; // 正面中心為 pos；深度沿旋轉後 +local Z，模型需額外轉 π。
  lotW: number;
  lotD: number; // 占地格數
  seed: number; // 外觀用
  state: 'construction' | 'active' | 'abandoned' | 'burned';
  stateTimer: number;
  problemSinceTick?: Partial<Record<ProblemType, number>>;
  abandonedAtTick?: number;
  constructionStartedTick?: number;
  rezoneAtTick?: number; // Complete deadline, removed without a refund after changed zoning.
  flags: number; // 位元旗標：HAS_POWER | HAS_WATER | HAS_SEWAGE | HAS_GARBAGE_SERVICE | ON_FIRE …
  problemTimers: Record<ProblemType, number>;
  housing?: HousingPopulation;
  jobEducation?: EducationCounts;
  workerEducation?: EducationCounts;
  households: number; // 住宅容量；實際入住戶數在 housing.occupied。
  residents: number; // 住宅
  jobs: number;
  workers: number; // 工作
  zoneBlock?: Id;
  blockCell?: number; // zoned 建築所屬格位
}

// ── 環境場 ──
export interface Fields {
  size: number; // 300（每 16 m 一格）
  pollution: Float32Array;
  noise: Float32Array;
  landValue: Float32Array;
  waterPollution: Float32Array;
  coverage: Record<ServiceType, Float32Array>;
}

// ── 全域 ──
export interface CityStats {
  day: number;
  money: number;
  population: number;
  populationDetails?: PopulationDetails;
  demand: Record<'R' | 'C' | 'I' | 'O', number>;
  income: number;
  expenses: number; // 上週
  power: {
    produced: number;
    consumed: number;
    served?: number;
    unpowered?: number;
    groups?: number;
  };
  water: {
    produced: number;
    consumed: number;
    served?: number;
    unserved?: number;
    groups?: number;
  };
  sewage: {
    capacity: number;
    produced: number;
    treated?: number;
    uncollected?: number;
  };
  happiness: number;
  milestone: number;
}
