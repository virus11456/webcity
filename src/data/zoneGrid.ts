/** Numerical and indexing settings; gameplay dimensions remain in config/zones. */
export const ZONE_GRID = {
  positionEpsilonM: 1e-6,
  areaEpsilonM2: 1e-6,
  slopeEpsilon: 1e-5,
  spatialBucketM: 64,
  junctionSides: 24,
  curveBlockWidth: 4,
} as const;
