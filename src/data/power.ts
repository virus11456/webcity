// M1-15 placement, deterministic wind field and original low-poly utility models.
export const POWER = {
  flag: 1,
  plantIds: ['power_wind', 'power_coal'],
  windCellM: 320,
  windSeed: 0x51f15e,
  graphCellM: 64,
  epsilon: 1e-7,
  maxLineM: 960,
  minLineM: 8,
  maxPoints: 32,
  sampleM: 8,
  towerSpacingM: 32,
  towerHeightM: 18,
  towerWidthM: 5,
  rotorHeightM: 30,
  rotorRadiusM: 12,
  rotorSpeed: 1.4,
  previewOpacity: 0.3,
  maxSlope: 0.15,
  maxHeightDifferenceM: 4,
} as const;
export type PowerPlantId = (typeof POWER.plantIds)[number];
