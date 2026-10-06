import type { MilestoneId } from './milestones';
import type { ZonePaletteId } from './palette';
// GDD §4–5. Capacity arrays are indexed by level - 1; education shares are percentages.
export type ZoneType = ZonePaletteId;
export interface ZoneDefinition {
  readonly maxLevel: 3 | 5;
  readonly unlock: MilestoneId;
  readonly lotWidthCells: readonly [number, number];
  readonly lotDepthCells: readonly [number, number];
  readonly capacityPerCell: readonly number[];
  readonly capacityUnit: 'households' | 'jobs';
  readonly demand: 'R' | 'C' | 'I' | 'O';
}
export const ZONES = {
  RL: {
    maxLevel: 5,
    unlock: 0,
    lotWidthCells: [1, 2],
    lotDepthCells: [1, 2],
    capacityPerCell: [0.5, 0.55, 0.6, 0.65, 0.75],
    capacityUnit: 'households',
    demand: 'R',
  },
  RH: {
    maxLevel: 5,
    unlock: 3,
    lotWidthCells: [2, 4],
    lotDepthCells: [2, 4],
    capacityPerCell: [3, 3.6, 4.2, 4.8, 5.6],
    capacityUnit: 'households',
    demand: 'R',
  },
  CL: {
    maxLevel: 3,
    unlock: 0,
    lotWidthCells: [1, 2],
    lotDepthCells: [1, 3],
    capacityPerCell: [2, 3, 4],
    capacityUnit: 'jobs',
    demand: 'C',
  },
  CH: {
    maxLevel: 3,
    unlock: 3,
    lotWidthCells: [2, 4],
    lotDepthCells: [2, 4],
    capacityPerCell: [5, 7, 9],
    capacityUnit: 'jobs',
    demand: 'C',
  },
  I: {
    maxLevel: 3,
    unlock: 0,
    lotWidthCells: [2, 4],
    lotDepthCells: [2, 4],
    capacityPerCell: [4, 5, 6],
    capacityUnit: 'jobs',
    demand: 'I',
  },
  O: {
    maxLevel: 3,
    unlock: 4,
    lotWidthCells: [2, 4],
    lotDepthCells: [2, 4],
    capacityPerCell: [8, 10, 12],
    capacityUnit: 'jobs',
    demand: 'O',
  },
} as const satisfies Record<ZoneType, ZoneDefinition>;
export const ZONE_CODES = {
  none: 0,
  RL: 1,
  RH: 2,
  CL: 3,
  CH: 4,
  I: 5,
  O: 6,
  invalid: 255,
} as const;
export type ZoneCode = (typeof ZONE_CODES)[keyof typeof ZONE_CODES];
export const JOB_EDUCATION_PERCENT = {
  CL: [
    [40, 40, 15, 5],
    [25, 40, 25, 10],
    [15, 30, 35, 20],
  ],
  CH: [
    [40, 40, 15, 5],
    [25, 40, 25, 10],
    [15, 30, 35, 20],
  ],
  I: [
    [50, 35, 10, 5],
    [35, 40, 20, 5],
    [20, 40, 30, 10],
  ],
  O: [
    [0, 20, 50, 30],
    [0, 10, 45, 45],
    [0, 5, 35, 60],
  ],
} as const satisfies Record<
  Exclude<ZoneType, 'RL' | 'RH'>,
  readonly (readonly [number, number, number, number])[]
>;
export const UPGRADE_REQUIREMENTS = [
  {
    level: 2,
    landValue: 21,
    residentEducation: 0.5,
    workerEducation: 0.6,
  },
  {
    level: 3,
    landValue: 41,
    residentEducation: 1,
    workerEducation: 1.2,
  },
  {
    level: 4,
    landValue: 61,
    residentEducation: 1.5,
    workerEducation: null,
  },
  {
    level: 5,
    landValue: 81,
    residentEducation: 2,
    workerEducation: null,
  },
] as const;
export const GROWTH = {
  zoneDepthCells: 4,
  invalidSlopeAbove: 0.25,
  brushRadiusCells: [1, 3],
  zoningCost: 0,
  rezoneDemolitionDays: 3,
  demandPerAttempt: 20,
  maxAttemptsPerTick: 5,
  maxSlopeExclusive: 0.15,
  constructionDays: 3,
  requiresUtilitiesToGrow: false,
  minCapacity: 1,
  meanHouseholdSize: 2.6,
  householdSizeRange: [1, 5],
  upgradeCheckDays: 10,
  upgradeRequires: ['power', 'water', 'garbage'],
  downgradeLandValueMargin: 10,
  downgradeDays: 30,
} as const;

// GDD §6 baseline for normal mode; createState and daily settlement calculate actual demand.
export const INITIAL_DEMAND = { R: 70, C: 20, I: 20, O: 0 } as const;
