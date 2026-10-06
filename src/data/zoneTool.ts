/** Interaction / rendering budgets; gameplay sizes live in config.ts and zones.ts. */
export const ZONE_TOOL = {
  maxCellsPerCommand: 16384,
  spatialBucketM: 64,
  renderBatchCells: 256,
  surfaceLiftM: 0.3,
  meshSubdivisions: 4,
  outlineFraction: 0.025,
} as const;
export type ZoneSelectionMode = 'fill' | 'rectangle' | 'small' | 'large';
