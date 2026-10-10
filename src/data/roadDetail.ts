/** Original road surfaces, in world metres. ART §2.2 / §6. */
export const ROAD_DETAIL = {
  size: 512,
  seed: 308,
  repeatM: 4,
  pavingM: 0.5,
  jointM: 0.018,
  asphaltContrast: 0.24,
  pavingContrast: 0.22,
  fadeStartM: 80,
  fadeEndM: 350,
} as const;
