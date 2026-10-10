/** Only systems implemented through M2. */
export const INFO_VIEWS = [
  'traffic',
  'power',
  'water',
  'sewage',
  'landValue',
  'pollution',
  'waterPollution',
  'noise',
  'crime',
  'health',
  'education',
  'happiness',
  'fireRisk',
  'population',
  'fertile',
  'forest',
  'ore',
  'oil',
  'wind',
] as const;
export type InfoView = (typeof INFO_VIEWS)[number];
export const INFO = {
  trafficWidthFraction: 0.72,
  trafficHeightM: 0.24,
  refreshSeconds: 0.25,
  buildingSampleRadiusM: 24,
  densityMaxPerHectare: 1500,
  squareMetresPerHectare: 10000,
  grayscale: 0.94,
  groundOpacity: 0.8,
  minLight: 0.55,
} as const;
