/** GDD §10.1; trees reserve one 8 m cell so repeated strokes are deterministic. */
export const PARKS = {
  ids: ['park_small', 'park_playground', 'park_plaza', 'park_large', 'tree'],
  treeSpacingM: 8,
  brushRadiusM: 16,
  maxBrushTrees: 128,
  maxTrees: 4000,
  baseLandValue: 10,
  maxLandValue: 100,
  treeBonusCap: 10,
} as const;
