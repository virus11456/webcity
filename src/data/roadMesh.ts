/** ART §6 MVP geometry dimensions, in metres; no simulation prices are changed. */
export const ROAD_MESH = {
  sampleM: 4,
  sidewalkM: 2.5,
  curbM: 0.3,
  curbHeightM: 0.18,
  surfaceLiftM: 0.12,
  markingLiftM: 0.025,
  lineWidthM: 0.18,
  doubleLineGapM: 0.3,
  dashM: 3,
  gapM: 6,
  cornerSteps: 8,
  cornerRadiusM: 6,
  maxTrimFraction: 0.45,
  bedClearanceM: 0.35,
  maxBatches: 24,
  rebuildBudgetMs: 4,
} as const;
