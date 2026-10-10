/** Lane routing choices, separate from vehicle following and simulation scheduling. */
export const LANE_GRAPH = {
  straightAngleRadians: Math.PI / 6,
  uTurnAngleRadians: (Math.PI * 5) / 6,
  turnHandleRatio: 0.5,
  turnSpeedMps: 8,
  straightJunctionTolerance: 1e-5,
  minimumTangentDenominator: 0.1,
} as const;
