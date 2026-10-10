/** Numerical tolerances only; gameplay limits remain in roads.ROAD_RULES. */
export const ROAD_GRAPH_PRECISION = {
  positionM: 1e-6,
  heightM: 1e-6,
  parallelSin: 1e-10,
  angleDegrees: 1e-7,
} as const;
