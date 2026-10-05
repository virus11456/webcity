// GDD §14. Item tables own their unlock; features cover non-placeable tools.
export const MILESTONES = [
  {
    id: 0,
    population: 0,
    reward: 0,
    maxOwnedTiles: 1,
  },
  {
    id: 1,
    population: 500,
    reward: 10000,
    maxOwnedTiles: 1,
  },
  {
    id: 2,
    population: 1200,
    reward: 15000,
    maxOwnedTiles: 1,
  },
  {
    id: 3,
    population: 2600,
    reward: 20000,
    maxOwnedTiles: 2,
  },
  {
    id: 4,
    population: 5000,
    reward: 30000,
    maxOwnedTiles: 2,
  },
  {
    id: 5,
    population: 7500,
    reward: 40000,
    maxOwnedTiles: 3,
  },
  {
    id: 6,
    population: 12000,
    reward: 50000,
    maxOwnedTiles: 4,
  },
  {
    id: 7,
    population: 20000,
    reward: 60000,
    maxOwnedTiles: 5,
  },
  {
    id: 8,
    population: 36000,
    reward: 80000,
    maxOwnedTiles: 6,
  },
  {
    id: 9,
    population: 50000,
    reward: 100000,
    maxOwnedTiles: 7,
  },
  {
    id: 10,
    population: 65000,
    reward: 120000,
    maxOwnedTiles: 9,
  },
] as const;
export type Milestone = (typeof MILESTONES)[number];
export type MilestoneId = Milestone['id'];
export interface FeatureDefinition {
  readonly id: string;
  readonly unlock: MilestoneId;
}
export const FEATURES = [
  {
    id: 'budget_panel',
    unlock: 1,
  },
  {
    id: 'junction_tool',
    unlock: 2,
  },
  {
    id: 'district_tool',
    unlock: 2,
  },
  {
    id: 'separate_taxes',
    unlock: 3,
  },
  {
    id: 'bus',
    unlock: 4,
  },
  {
    id: 'policies',
    unlock: 4,
  },
  {
    id: 'tunnel',
    unlock: 6,
  },
  {
    id: 'industry_specialization',
    unlock: 6,
  },
  {
    id: 'metro',
    unlock: 7,
  },
  {
    id: 'unique_batch_1',
    unlock: 8,
  },
  {
    id: 'unique_batch_2',
    unlock: 10,
  },
] as const satisfies readonly FeatureDefinition[];
export type FeatureId = (typeof FEATURES)[number]['id'];
export const TILE_PURCHASE = {
  secondTileCost: 50000,
  costIncrement: 30000,
  adjacentOnly: true,
} as const;
