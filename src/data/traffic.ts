/** Physical distances are metres; time compression is shared with the living-day clock. */
export const TRAFFIC_RUNTIME = {
  capacity: 3000,
  streamMs: 50,
  streamStride: 10,
  carLengthM: 4.4,
  carWidthM: 1.8,
  pedestrianLengthM: 0.5,
  pedestrianGapM: 0.4,
  pedestrianStopOffsetM: 1,
  accelerationMps2: 3,
  stopWaitSeconds: 1,
  stoppedSpeedMps: 0.1,
  stoppedDistanceM: 0.01,
  maxVehicleId: 16777215,
  maxTransitionsPerStep: 32,
  congestionSampleSeconds: 2,
} as const;
export const TrafficKind = {
  car: 0,
  truck: 1,
  bus: 2,
  police: 3,
  fire: 4,
  ambulance: 5,
  garbage: 6,
  hearse: 7,
  pedestrian: 8,
} as const;
