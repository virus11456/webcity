/** Dispatch limits affect scheduling only; GDD ignition/damage remain in SERVICE_RULES. */
export const FIRE = {
  requestsPerTick: 8,
  retryTicks: 2,
  maxMissions: 128,
  seedDaySalt: 2654435761,
  seedBuildingSalt: 2246822519,
  maxSprites: 512,
  phaseCycle: 1024,
  anchorHeightM: 4,
  spriteHeightM: 16,
  spriteWidthM: 18,
  smokeHeightM: 32,
  cullDistanceM: 1500,
} as const;
