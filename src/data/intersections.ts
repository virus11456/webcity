/** Intersection interaction, signal grouping and original street-furniture dimensions. */
export const INTERSECTIONS = {
  unlock: 2,
  pickRadiusM: 16,
  oppositeToleranceRadians: Math.PI / 12,
  crossingDepthM: 3,
  stripeWidthM: 0.5,
  stripeGapM: 0.5,
  stopLineOffsetM: 5,
  poleHeightM: 4.5,
  poleRadiusM: 0.12,
  housingWidthM: 0.5,
  housingHeightM: 1.4,
  housingDepthM: 0.3,
  bulbRadiusM: 0.17,
  stopRadiusM: 0.65,
  stopHeightM: 2.6,
} as const;
