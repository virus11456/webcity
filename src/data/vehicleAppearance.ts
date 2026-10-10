/** ART §8. Geometry dimensions are metres; rendering never changes agent destinations. */
export const VEHICLE_APPEARANCE = {
  capacity: 3000,
  cullM: 900,
  lodM: 400,
  pedestrianCullM: 120,
  roadLiftM: 0.12,
  pickRadiusPx: 22,
  car: [1.8, 1.5, 4.4],
  truck: [2.5, 3.5, 8],
  bus: [2.5, 3.2, 12],
  pedestrian: [0.45, 1.75, 0.5],
  defaultStepSeconds: 0.24,
  maximumInterpolationSeconds: 0.5,
  weights: [25, 15, 20, 10, 10, 5, 5, 5, 5],
} as const;
