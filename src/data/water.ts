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
