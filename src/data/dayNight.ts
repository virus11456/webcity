/** ART §4.1. The visual day shares the 360-second citizen schedule. */
export const DAY_NIGHT = {
  hours: [0, 4, 5.5, 8, 12, 17.5, 19, 21, 24],
  sun: [0.35, 0.35, 1, 2.6, 3, 2.2, 0.8, 0.35, 0.35],
  ambient: [0.25, 0.25, 0.5, 1, 1.2, 0.9, 0.5, 0.25, 0.25],
  windowIntensity: 1.4,
  lampHeightM: 8,
  lampSpacingM: 32,
  lampRadiusM: 7,
  lampOpacity: 0.28,
  vehicleGlowM: 0.8,
} as const;
