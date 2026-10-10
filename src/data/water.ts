/** MVP visual water tuning in metres and seconds (ART §5.2). */
export const WATER = {
  shallowDepth: 3,
  deepDepth: 15,
  dryCutoff: 0.06,
  shallowOpacity: 0.66,
  deepOpacity: 0.92,
  rippleScale: 8,
  swellScale: 40,
  rippleStrength: 0.07,
  angularSpeed: 0.6,
  maxFrameSeconds: 0.05,
  roughness: 0.32,
  metalness: 0.12,
} as const;

/** ART §5.2, display-only water material settings. */
export const WATER_DETAIL = {
  normalSize: 128,
  normalStrength: 0.22,
  flowMps: 0.7,
  phasePeriodSeconds: 400,
  foamDepthM: 0.8,
  foamOpacity: 0.65,
  fresnelBase: 0.04,
  pollutionMax: 100,
} as const;
