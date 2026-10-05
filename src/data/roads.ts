import type { MilestoneId } from './milestones';
// GDD §3.1: costs are per 8 metres, maintenance is weekly.
export interface RoadDefinition {
  readonly widthM: number;
  readonly lanesForward: number;
  readonly lanesBackward: number;
  readonly speedKph: number;
  readonly costPer8M: number;
  readonly upkeepPer8MWeek: number;
  readonly zoning: 'all' | 'none' | 'low-density';
  readonly noise: number;
  readonly unlock: MilestoneId;
}
export const ROADS = {
  road_small: {
    widthM: 16,
    lanesForward: 1,
    lanesBackward: 1,
    speedKph: 40,
    costPer8M: 20,
    upkeepPer8MWeek: 0.16,
    zoning: 'all',
    noise: 1,
    unlock: 0,
  },
  road_small_oneway: {
    widthM: 16,
    lanesForward: 2,
    lanesBackward: 0,
    speedKph: 40,
    costPer8M: 20,
    upkeepPer8MWeek: 0.16,
    zoning: 'all',
    noise: 1,
    unlock: 0,
  },
  road_small_trees: {
    widthM: 16,
    lanesForward: 1,
    lanesBackward: 1,
    speedKph: 40,
    costPer8M: 30,
    upkeepPer8MWeek: 0.24,
    zoning: 'all',
    noise: 0.5,
    unlock: 2,
  },
  road_medium: {
    widthM: 24,
    lanesForward: 2,
    lanesBackward: 2,
    speedKph: 50,
    costPer8M: 50,
    upkeepPer8MWeek: 0.4,
    zoning: 'all',
    noise: 2,
    unlock: 1,
  },
  road_large: {
    widthM: 32,
    lanesForward: 3,
    lanesBackward: 3,
    speedKph: 60,
    costPer8M: 90,
    upkeepPer8MWeek: 0.72,
    zoning: 'all',
    noise: 3,
    unlock: 4,
  },
  highway: {
    widthM: 18,
    lanesForward: 3,
    lanesBackward: 0,
    speedKph: 100,
    costPer8M: 80,
    upkeepPer8MWeek: 0.64,
    zoning: 'none',
    noise: 4,
    unlock: 3,
  },
  highway_ramp: {
    widthM: 8,
    lanesForward: 1,
    lanesBackward: 0,
    speedKph: 80,
    costPer8M: 40,
    upkeepPer8MWeek: 0.32,
    zoning: 'none',
    noise: 3,
    unlock: 3,
  },
  gravel: {
    widthM: 8,
    lanesForward: 1,
    lanesBackward: 1,
    speedKph: 20,
    costPer8M: 8,
    upkeepPer8MWeek: 0.05,
    zoning: 'low-density',
    noise: 0.5,
    unlock: 0,
  },
} as const satisfies Record<string, RoadDefinition>;
export type RoadTypeId = keyof typeof ROADS;
export const ROAD_RULES = {
  elevatedCostMultiplier: 3,
  elevatedUpkeepMultiplier: 2,
  pierSpacingM: 48,
  maxElevationM: 30,
  tunnelCostMultiplier: 4,
  tunnelUnlock: 6,
  maxSlope: 0.12,
  highwayMaxSlope: 0.06,
  snapAngleDegrees: 15,
  snapLengthM: 8,
  nodeSnapDistanceM: 8,
  minSegmentM: 16,
  minJunctionAngleDegrees: 30,
  greenLightGameSeconds: 12,
  refundDays: 7,
  refundFraction: 1,
} as const;
