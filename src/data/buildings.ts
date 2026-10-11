import type { MilestoneId } from './milestones';
// GDD §9, §10, §16. Null means unspecified by the design, never zero.
export const SERVICE_TYPES = [
  'police',
  'fire',
  'health',
  'education',
  'deathcare',
  'garbage',
  'parks',
  'transit',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];
export interface BuildingDefinition {
  readonly id: string;
  readonly kind: 'utility' | 'service' | 'park';
  readonly cost: number;
  readonly upkeepPerWeek: number;
  readonly unlock: MilestoneId;
  readonly footprintCells: readonly [number, number] | null;
  readonly power?: {
    readonly maxMW: number | null;
    readonly mode: 'constant' | 'wind' | 'daylight' | 'head-dependent';
  };
  readonly pollution?: 'none' | 'noise' | 'high-ground-air' | 'medium';
  readonly placement?:
    | 'land'
    | 'across-river'
    | 'shore-intake-submerged'
    | 'flat-groundwater'
    | 'shore';
  readonly water?: {
    readonly capacityM3PerWeek: number;
    readonly output: 'water' | 'sewage';
    readonly pollutionReduction: number;
  };
  readonly garbage?: {
    readonly storageUnits: number | null;
    readonly processingUnitsPerDay: number | null;
    readonly trucks: number;
  };
  readonly service?: ServiceType;
  readonly radiusM?: number;
  readonly capacity?: {
    readonly vehicles?: number;
    readonly detention?: boolean;
    readonly patients?: number;
    readonly students?: number;
    readonly educationLevel?: 1 | 2 | 3;
    readonly graves?: number;
    readonly processingPerDay?: number;
  };
  readonly landValueBonus?: number;
  readonly landValueBonusCap?: number;
  readonly reducesNoise?: boolean;
}
export const BUILDINGS = [
  {
    id: 'power_wind',
    kind: 'utility',
    cost: 2000,
    upkeepPerWeek: 64,
    unlock: 0,
    footprintCells: [2, 2],
    power: {
      maxMW: 4,
      mode: 'wind',
    },
    pollution: 'noise',
    placement: 'land',
  },
  {
    id: 'power_coal',
    kind: 'utility',
    cost: 19000,
    upkeepPerWeek: 640,
    unlock: 0,
    footprintCells: [6, 6],
    power: {
      maxMW: 40,
      mode: 'constant',
    },
    pollution: 'high-ground-air',
    placement: 'land',
  },
  {
    id: 'power_oil',
    kind: 'utility',
    cost: 28000,
    upkeepPerWeek: 880,
    unlock: 3,
    footprintCells: [6, 6],
    power: {
      maxMW: 64,
      mode: 'constant',
    },
    pollution: 'medium',
    placement: 'land',
  },
  {
    id: 'power_solar',
    kind: 'utility',
    cost: 45000,
    upkeepPerWeek: 1040,
    unlock: 5,
    footprintCells: [8, 8],
    power: {
      maxMW: 64,
      mode: 'daylight',
    },
    pollution: 'none',
    placement: 'land',
  },
  {
    id: 'power_hydro',
    kind: 'utility',
    cost: 80000,
    upkeepPerWeek: 1280,
    unlock: 6,
    footprintCells: null,
    power: {
      maxMW: null,
      mode: 'head-dependent',
    },
    pollution: 'none',
    placement: 'across-river',
  },
  {
    id: 'water_pump',
    kind: 'utility',
    cost: 2500,
    upkeepPerWeek: 120,
    unlock: 0,
    footprintCells: [2, 2],
    water: {
      capacityM3PerWeek: 12000,
      output: 'water',
      pollutionReduction: 0,
    },
    placement: 'shore-intake-submerged',
  },
  {
    id: 'water_tower',
    kind: 'utility',
    cost: 3000,
    upkeepPerWeek: 160,
    unlock: 0,
    footprintCells: [2, 2],
    water: {
      capacityM3PerWeek: 6000,
      output: 'water',
      pollutionReduction: 0,
    },
    placement: 'flat-groundwater',
  },
  {
    id: 'water_drain',
    kind: 'utility',
    cost: 2500,
    upkeepPerWeek: 120,
    unlock: 0,
    footprintCells: [2, 2],
    water: {
      capacityM3PerWeek: 30000,
      output: 'sewage',
      pollutionReduction: 0,
    },
    placement: 'shore',
  },
  {
    id: 'water_treatment',
    kind: 'utility',
    cost: 25000,
    upkeepPerWeek: 800,
    unlock: 4,
    footprintCells: [4, 4],
    water: {
      capacityM3PerWeek: 30000,
      output: 'sewage',
      pollutionReduction: 0.85,
    },
    placement: 'land',
  },
  {
    id: 'garbage_landfill',
    kind: 'utility',
    cost: 6000,
    upkeepPerWeek: 240,
    unlock: 1,
    footprintCells: null,
    garbage: {
      storageUnits: 80000,
      processingUnitsPerDay: null,
      trucks: 6,
    },
  },
  {
    id: 'garbage_incinerator',
    kind: 'utility',
    cost: 32000,
    upkeepPerWeek: 960,
    unlock: 4,
    footprintCells: null,
    garbage: {
      storageUnits: null,
      processingUnitsPerDay: 2000,
      trucks: 10,
    },
    power: {
      maxMW: 8,
      mode: 'constant',
    },
  },
  {
    id: 'garbage_recycling',
    kind: 'utility',
    cost: 18000,
    upkeepPerWeek: 640,
    unlock: 6,
    footprintCells: null,
    garbage: {
      storageUnits: null,
      processingUnitsPerDay: 1000,
      trucks: 8,
    },
  },
  {
    id: 'police_station',
    kind: 'service',
    cost: 4000,
    upkeepPerWeek: 240,
    unlock: 1,
    footprintCells: [4, 4],
    service: 'police',
    radiusM: 500,
    capacity: {
      vehicles: 6,
    },
  },
  {
    id: 'police_hq',
    kind: 'service',
    cost: 18000,
    upkeepPerWeek: 800,
    unlock: 5,
    footprintCells: [6, 6],
    service: 'police',
    radiusM: 900,
    capacity: {
      vehicles: 20,
      detention: true,
    },
  },
  {
    id: 'fire_station',
    kind: 'service',
    cost: 4000,
    upkeepPerWeek: 240,
    unlock: 1,
    footprintCells: [4, 4],
    service: 'fire',
    radiusM: 500,
    capacity: {
      vehicles: 5,
    },
  },
  {
    id: 'fire_hq',
    kind: 'service',
    cost: 20000,
    upkeepPerWeek: 880,
    unlock: 5,
    footprintCells: [6, 6],
    service: 'fire',
    radiusM: 900,
    capacity: {
      vehicles: 15,
    },
  },
  {
    id: 'clinic',
    kind: 'service',
    cost: 5000,
    upkeepPerWeek: 320,
    unlock: 1,
    footprintCells: [3, 3],
    service: 'health',
    radiusM: 500,
    capacity: {
      patients: 100,
      vehicles: 4,
    },
  },
  {
    id: 'hospital',
    kind: 'service',
    cost: 25000,
    upkeepPerWeek: 1200,
    unlock: 4,
    footprintCells: [6, 6],
    service: 'health',
    radiusM: 1000,
    capacity: {
      patients: 1000,
      vehicles: 10,
    },
  },
  {
    id: 'school_elementary',
    kind: 'service',
    cost: 6000,
    upkeepPerWeek: 360,
    unlock: 2,
    footprintCells: [5, 5],
    service: 'education',
    radiusM: 600,
    capacity: {
      students: 300,
      educationLevel: 1,
    },
  },
  {
    id: 'school_high',
    kind: 'service',
    cost: 16000,
    upkeepPerWeek: 640,
    unlock: 3,
    footprintCells: [6, 6],
    service: 'education',
    radiusM: 900,
    capacity: {
      students: 1000,
      educationLevel: 2,
    },
  },
  {
    id: 'university',
    kind: 'service',
    cost: 50000,
    upkeepPerWeek: 1600,
    unlock: 5,
    footprintCells: [8, 8],
    service: 'education',
    radiusM: 1500,
    capacity: {
      students: 4500,
      educationLevel: 3,
    },
  },
  {
    id: 'cemetery',
    kind: 'service',
    cost: 3000,
    upkeepPerWeek: 120,
    unlock: 2,
    footprintCells: null,
    service: 'deathcare',
    radiusM: 600,
    capacity: {
      graves: 2000,
      vehicles: 4,
    },
  },
  {
    id: 'crematorium',
    kind: 'service',
    cost: 15000,
    upkeepPerWeek: 600,
    unlock: 4,
    footprintCells: null,
    service: 'deathcare',
    radiusM: 900,
    capacity: {
      processingPerDay: 100,
    },
  },
  {
    id: 'park_small',
    kind: 'park',
    cost: 600,
    upkeepPerWeek: 24,
    unlock: 0,
    footprintCells: [2, 2],
    landValueBonus: 10,
    radiusM: 160,
  },
  {
    id: 'park_playground',
    kind: 'park',
    cost: 1200,
    upkeepPerWeek: 48,
    unlock: 1,
    footprintCells: [2, 2],
    landValueBonus: 12,
    radiusM: 200,
  },
  {
    id: 'park_plaza',
    kind: 'park',
    cost: 2000,
    upkeepPerWeek: 64,
    unlock: 2,
    footprintCells: [3, 3],
    landValueBonus: 14,
    radiusM: 240,
  },
  {
    id: 'park_large',
    kind: 'park',
    cost: 5000,
    upkeepPerWeek: 160,
    unlock: 5,
    footprintCells: [6, 6],
    landValueBonus: 20,
    radiusM: 400,
  },
  {
    id: 'tree',
    kind: 'park',
    cost: 5,
    upkeepPerWeek: 0,
    unlock: 0,
    footprintCells: [1, 1],
    landValueBonus: 0.2,
    radiusM: 24,
    landValueBonusCap: 10,
    reducesNoise: true,
  },
  {
    id: 'bus_depot',
    kind: 'service',
    cost: 6000,
    upkeepPerWeek: 300,
    unlock: 4,
    footprintCells: [4, 4],
    service: 'transit',
    capacity: {
      vehicles: 20,
    },
  },
  {
    id: 'metro_station',
    kind: 'service',
    cost: 9000,
    upkeepPerWeek: 360,
    unlock: 7,
    footprintCells: [4, 4],
    service: 'transit',
  },
] as const satisfies readonly BuildingDefinition[];
export type BuildingDefId = (typeof BUILDINGS)[number]['id'];
export const NETWORKS = [
  {
    id: 'power_line',
    costPer8M: 10,
    upkeepPer8MWeek: 0.08,
    unlock: 0,
    canCrossWater: true,
    underground: false,
  },
  {
    id: 'water_pipe',
    costPer8M: 10,
    upkeepPer8MWeek: 0.08,
    unlock: 0,
    canCrossWater: true,
    underground: true,
  },
  {
    id: 'metro_track',
    costPer8M: 60,
    upkeepPer8MWeek: null,
    unlock: 7,
    canCrossWater: null,
    underground: true,
  },
] as const satisfies readonly NetworkDefinition[];
export interface NetworkDefinition {
  readonly id: string;
  readonly costPer8M: number;
  readonly upkeepPer8MWeek: number | null;
  readonly unlock: MilestoneId;
  readonly canCrossWater: boolean | null;
  readonly underground: boolean;
}
export type NetworkTypeId = (typeof NETWORKS)[number]['id'];
export const UTILITY_RULES = {
  powerReachM: 16,
  powerMW: {
    household: 0.006,
    commercialJob: 0.008,
    industrialJob: 0.012,
    officeJob: 0.01,
    serviceBuilding: null,
  },
  solarDayOutputFraction: 1,
  solarNightOutputFraction: 0,
  waterReachM: 48,
  waterM3PerWeek: {
    household: 12,
    job: 10,
  },
  sewageToWaterRatio: 1,
  garbagePerDay: {
    household: 1,
    job: 0.8,
  },
  garbageOverflowUnits: 200,
} as const;
export const TRANSIT = {
  busRouteMetresPerVehicle: 800,
  busUpkeepPerWeek: 40,
  busPassengers: 30,
  metroPassengers: 180,
} as const;
