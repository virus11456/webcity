/** GDD §16: direct bus lines; all unspecified tuning is documented in BUS.md. */
export const TRANSIT = {
  stopRadiusM: 1.3,
  stopHeightM: 9,
  maxLines: 32,
  maxStops: 32,
  stopSnapM: 24,
  stopSpacingM: 24,
  catchmentM: 200,
  minTripM: 300,
  fare: 2,
  maxPassengers: 600,
  missionPurpose: 8,
  refreshTicks: 8,
  maxWaitTicks: 250,
} as const;
