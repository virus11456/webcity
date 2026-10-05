/** Camera input tuning; CSS pixels, seconds and radians. */
export const INPUT = {
  dragSlopPx: 6,
  longPressMs: 550,
  rotatePerPixel: 0.006,
  tiltPerPixel: 0.004,
  wheelScale: 0.0015,
  wheelLinePx: 16,
  wheelMaxPx: 500,
  panDistancePerSecond: 0.65,
  rotatePerSecond: 1.2,
  tiltPerSecond: 0.7,
  maxDeltaSeconds: 0.05,
  edgePx: 24,
  pairSlopPx: 10,
  pairScaleSlop: 0.06,
  pairAngleSlop: 0.08,
  verticalDominance: 2,
} as const;
