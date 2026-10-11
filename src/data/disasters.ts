/** Optional large urban fires; routine M2 building fires remain independent. */
export const DISASTERS = {
  minIntervalDays: 14,
  maxIntervalDays: 35,
  warningDays: 3,
  radiusM: 120,
  maxBuildings: 3,
  seedSalt: 414,
  rebuildFraction: 0.5,
  zonedCostPerCell: 500,
} as const;
