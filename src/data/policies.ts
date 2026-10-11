import type { MilestoneId } from './milestones';
// GDD §15. Multipliers apply to the named baseline; demand/threshold deltas are points.
export interface PolicyEffects {
  readonly maxLevel?: number;
  readonly maxFloors?: number;
  readonly healthMultiplier?: number;
  readonly happinessDelta?: number;
  readonly garbageMultiplier?: number;
  readonly busFare?: number;
  readonly busRidershipMultiplier?: number;
  readonly banLocalTrucks?: boolean;
  readonly powerMultiplier?: number;
  readonly waterMultiplier?: number;
  readonly parkUpkeepMultiplier?: number;
  readonly educationMultiplier?: number;
  readonly residentialLandThresholdDelta?: number;
  readonly lowCommercialDemandDelta?: number;
  readonly taxRevenueMultiplier?: number;
}
export interface PolicyDefinition {
  readonly id: string;
  readonly unlock: MilestoneId;
  readonly costPerHouseholdWeek: number;
  readonly effects: PolicyEffects;
}
export const POLICIES = [
  {
    id: 'no_highrises',
    unlock: 4,
    costPerHouseholdWeek: 0,
    effects: {
      maxLevel: 3,
      maxFloors: 4,
    },
  },
  {
    id: 'smoking_ban',
    unlock: 4,
    costPerHouseholdWeek: 0.1,
    effects: {
      healthMultiplier: 1.1,
      happinessDelta: -2,
    },
  },
  {
    id: 'recycling_plan',
    unlock: 4,
    costPerHouseholdWeek: 0.2,
    effects: {
      garbageMultiplier: 0.8,
    },
  },
  {
    id: 'free_bus',
    unlock: 4,
    costPerHouseholdWeek: 0,
    effects: {
      busFare: 0,
      busRidershipMultiplier: 1.3,
    },
  },
  {
    id: 'heavy_vehicle_ban',
    unlock: 4,
    costPerHouseholdWeek: 0,
    effects: {
      banLocalTrucks: true,
    },
  },
  {
    id: 'energy_saving',
    unlock: 4,
    costPerHouseholdWeek: 0.2,
    effects: {
      powerMultiplier: 0.85,
    },
  },
  {
    id: 'water_saving',
    unlock: 4,
    costPerHouseholdWeek: 0.2,
    effects: {
      waterMultiplier: 0.85,
    },
  },
  {
    id: 'pet_ban',
    unlock: 4,
    costPerHouseholdWeek: 0,
    effects: {
      parkUpkeepMultiplier: 0.9,
      happinessDelta: -1,
    },
  },
  {
    id: 'education_campaign',
    unlock: 4,
    costPerHouseholdWeek: 0.3,
    effects: {
      educationMultiplier: 1.1,
    },
  },
  {
    id: 'high_tech_housing',
    unlock: 4,
    costPerHouseholdWeek: 0.4,
    effects: {
      residentialLandThresholdDelta: -10,
    },
  },
  {
    id: 'small_business',
    unlock: 4,
    costPerHouseholdWeek: 0,
    effects: {
      lowCommercialDemandDelta: 10,
      taxRevenueMultiplier: 0.9,
    },
  },
] as const satisfies readonly PolicyDefinition[];
export type PolicyId = (typeof POLICIES)[number]['id'];
export const INDUSTRY_SPECIALIZATIONS = [
  {
    id: 'industry_forestry',
    resource: 'forest',
    unlock: 6,
    costPerHouseholdWeek: 0,
    educationDistribution: [75, 20, 5, 0],
    pollutionPerJob: 0.1,
  },
  {
    id: 'industry_farming',
    resource: 'fertile',
    unlock: 6,
    costPerHouseholdWeek: 0,
    educationDistribution: [75, 20, 5, 0],
    pollutionPerJob: 0,
  },
  {
    id: 'industry_ore',
    resource: 'ore',
    unlock: 6,
    costPerHouseholdWeek: 0,
    educationDistribution: [75, 20, 5, 0],
    pollutionPerJob: 0.8,
  },
  {
    id: 'industry_oil',
    resource: 'oil',
    unlock: 6,
    costPerHouseholdWeek: 0,
    educationDistribution: [75, 20, 5, 0],
    pollutionPerJob: 1.2,
  },
] as const;
export type IndustrySpecializationId =
  (typeof INDUSTRY_SPECIALIZATIONS)[number]['id'];
