/** ART §7.3 / §12: six tree silhouettes, two shrubs, deterministic natural cover. */
export const VEGETATION = {
  trees: 55000,
  shrubs: 5000,
  attemptsPerPlant: 12,
  workSlice: 512,
  budgetMs: 3,
  seedOffset: 309,
  waterClearanceM: 2,
  crownClearanceM: 2,
  occupancyCellM: 8,
  lod0M: 250,
  lod1M: 900,
  lodHysteresisM: 25,
  cameraRefreshM: 12,
  sizes: [10, 13, 8, 15, 11, 12, 2.5, 1.5],
} as const;
