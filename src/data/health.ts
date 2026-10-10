/** Daily health balance; a separate byte preserves hundredths across days and saves. */
export const HEALTH = {
  precision: 100,
  recoveryPerCoverageDay: 4,
  pollutionLossPerPointDay: 0.04,
  waterLossPerPointDay: 0.06,
  maxExposure: 100,
  sickBelow: 40,
} as const;
