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
  cameraPosition: [90, 65, 100],
  cameraTarget: [0, 12, 0],
  fovDegrees: 50,
  nearM: 1,
  farM: 6000,
  skyRadiusM: 5000,
  debugIntervalMs: 500,
} as const;
