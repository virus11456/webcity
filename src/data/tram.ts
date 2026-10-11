/** M4-03 additions to GDD §16. Road rails are billed once per line/road. */
export const TRAM = {
  maxTrackSections: 4096,
  trackUnitM: 8,
  passengers: 90,
  fare: 3,
  upkeepPerWeek: 60,
  trackCostPer8M: 30,
  maxLineM: 6400,
  railOffsetM: 0.65,
  railLiftM: 0.04,
  vehicleLengthM: 18,
} as const;
