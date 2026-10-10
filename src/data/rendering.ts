// ART §4. Preview dimensions are temporary until M0-08/M0-10 provide camera/terrain.
export const LIGHTING = {
  sunIntensity: 3,
  hemisphereIntensity: 1.2,
  shadowBias: -0.0005,
  shadowNormalBias: 0.02,
  cascades: 3,
  shadowRangeM: 600,
  fogDensity: 0.00012,
  sunDirection: [-1, 1.5, 1],
} as const;
export const RENDER_PREVIEW = {
  boxSizeM: 24,
  groundSizeM: 4000,
  nearM: 1,
  farM: 6000,
  skyRadiusM: 5000,
  debugIntervalMs: 500,
} as const;

// ART §10; near-zoom tilt cap and numerical picking settings are documented in CAMERA.md.
export const CAMERA = {
  fovDegrees: 45,
  minDistanceM: 20,
  maxDistanceM: 4000,
  minElevationDegrees: 15,
  maxElevationDegrees: 89,
  nearMaxElevationDegrees: 60,
  damping: 0.15,
  referenceFps: 60,
  terrainClearanceM: 5,
  flySeconds: 1,
  followDistanceM: 100,
  initialDistanceM: 160,
  initialAzimuthDegrees: 45,
  initialElevationDegrees: 18,
  rayStepM: 8,
  rayIterations: 32,
  anchorIterations: 12,
  anchorToleranceM: 0.00001,
  derivativeStepM: 0.01,
  derivativeEpsilon: 1e-10,
} as const;
