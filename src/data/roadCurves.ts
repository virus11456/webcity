/** Numerical accuracy and bounded input work for curved roads. */
export const ROAD_CURVES = {
  sampleM: 4,
  lengthErrorM: 0.001,
  intersectionErrorM: 0.000001,
  newtonSteps: 16,
  maxControlLengthM: 10000,
  freeHandleRatio: 1 / 3,
} as const;
