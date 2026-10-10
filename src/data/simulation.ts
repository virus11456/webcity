// GDD §5.5–8, §10–12: pure configuration, no simulation behavior.
export const PROBLEMS = {
  noPower: {
    days: 20,
    result: 'abandoned',
  },
  noWater: {
    days: 20,
    result: 'abandoned',
  },
  noSewage: {
    days: 30,
    result: 'abandoned',
  },
  noRoad: {
    days: 30,
    result: 'abandoned',
  },
  noWorkers: {
    days: 30,
    result: 'abandoned',
  },
  noCustomers: {
    days: 30,
    result: 'abandoned',
  },
  noGoods: {
    days: 30,
    result: 'abandoned',
  },
  garbage: {
    days: 40,
    result: 'abandoned',
  },
  crime: {
    days: 40,
    result: 'abandoned',
  },
  sickness: {
    days: 40,
    result: 'abandoned',
  },
  fire: {
    days: 2,
    result: 'burned',
  },
} as const;
export type ProblemType = keyof typeof PROBLEMS;
export const PROBLEM_THRESHOLDS = {
  workerFillBelow: 0.25,
  commercialSalesBelow: 0.3,
  crimeAbove: 80,
  sickResidentsAbove: 0.3,
} as const;
export const ABANDONMENT = {
  landValuePenalty: 10,
  radiusM: 64,
  demolitionPerCell: 100,
  collapseDays: 60,
} as const;
export const DEMAND = {
  range: [0, 100],
  workingAge: [16, 65],
  estimatedWorkerFraction: 0.55,
  highEducationMin: 2,
  neutralTaxPercent: 9,
  taxPenaltyPerPercentagePoint: 4,
  earlyBonusPopulation: 1000,
  maxEarlyBonus: 40,
  residentialBase: 30,
  minWorkerDenominator: 100,
  scale: 100,
  neutralHappiness: 50,
  happinessFactor: 0.4,
  commercialBase: 20,
  commercialJobsPerResident: 0.2,
  industrialBase: 20,
  industrialJobsPerResident: 0.22,
  industrialJobsPerCommercialJob: 0.5,
  officeJobsPerEducatedWorker: 0.45,
  minJobDenominator: 50,
  shortageFractionPerPenalty: 0.1,
  shortagePenalty: 5,
} as const;
export const CITIZENS = {
  maxMoveInHouseholdsPerBuildingDay: 1,
  moveOutHappinessBelow: 30,
  moveOutChancePerDay: 0.02,
  moveOutHouseholds: 1,
  ageRange: [0, 100],
  daysPerAgeYear: 30,
  ageGroups: {
    child: [0, 12],
    teen: [13, 18],
    adult: [19, 64],
    elder: [65, 100],
  },
  educationRange: [0, 3],
  healthRange: [0, 100],
  happinessRange: [0, 100],
  agentScale: {
    desktop: 4,
    ipad: 6,
    iphone: 10,
  },
  schedule: {
    workHours: [6, 9],
    shoppingHours: [12, 14],
    shoppingChance: 0.3,
    homeHours: [16, 19],
    leisureHours: [19, 22],
    leisureChance: 0.2,
  },
  walkDistanceBelowM: 600,
  walkToBusBelowM: 400,
  busChance: 0.5,
  birthIntervalDays: 30,
  birthChancePerAdultHousehold: 0.03,
  elderDeathBaseAge: 60,
  elderDeathAnnualRatePerYear: 0.015,
} as const;
export const TRAFFIC = {
  pathCacheDays: 30,
  safetyGapM: 2,
  safetyHeadwaySeconds: 1,
  laneChangeLastFraction: 0.3333333333333333,
  despawnStuckGameSeconds: 60,
  goodFlowAbove: 0.7,
  badFlowBelow: 0.4,
} as const;
export const VEHICLE_TYPES = [
  'car',
  'truck',
  'bus',
  'police',
  'fire',
  'ambulance',
  'garbage',
  'hearse',
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const SERVICE_RULES = {
  crimeDailyBase: 0.5,
  crimeUnemploymentFactor: 2,
  crimePoliceFactor: 3,
  crimeRange: [0, 100],
  fireBaseChancePerDay: 0.0002,
  fireDamagePerDay: 0.5,
} as const;
export const ENVIRONMENT = {
  updateDays: 1,
  pollution: {
    perIndustrialJob: 0.5,
    perCoalOrOilPlant: 200,
    perLandfill: 100,
    neighborCount: 8,
    diffusionFraction: 0.1,
    decayFraction: 0.05,
  },
  noise: {
    distanceExponent: 2,
    treeReductionFraction: 0.2,
  },
  waterPollution: {
    flow: 'downstream',
  },
  landValue: {
    base: 10,
    serviceBonus: 5,
    waterfrontRadiusM: 200,
    waterfrontBonus: 8,
    transitRadiusM: 300,
    transitBonus: 5,
    pollutionPenalty: 0.3,
    noisePenalty: 0.2,
    abandonedPenalty: 10,
    smoothingKernelCells: 3,
    range: [0, 100],
  },
} as const;
export const HAPPINESS = {
  base: 50,
  noPower: -25,
  noWater: -25,
  noSewage: -15,
  noGarbage: -10,
  serviceBonus: 5,
  parkFactor: 0.5,
  pollutionPenalty: 0.3,
  noisePenalty: 0.2,
  crimePenalty: 0.2,
  neutralTaxPercent: 9,
  taxPenaltyPerPercentagePoint: 1.5,
  range: [0, 100],
  happyAbove: 70,
  unhappyBelow: 40,
} as const;
export type SimulationConfig =
  | typeof DEMAND
  | typeof CITIZENS
  | typeof TRAFFIC
  | typeof ENVIRONMENT
  | typeof HAPPINESS;

// M1 aggregate incoming population assumptions (GDD §7.1); mean household size = 2.6.
export const POPULATION_PROFILE = {
  jobSearchCellM: 64,
  householdSizePercent: [20, 30, 30, 10, 10],
  educationPercent: [40, 40, 15, 5],
  agePercent: [20, 10, 55, 15],
} as const;
