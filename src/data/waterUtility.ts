/** M1-16 water network and siting rules; dimensions/shore tolerances documented in GDD §9.2. */
export const WATER_UTILITY = {
  facilityIds: ['water_tower', 'water_pump', 'water_drain', 'water_treatment'],
  waterFlag: 2,
  sewageFlag: 4,
  pipeJoinM: 2,
  snapM: 8,
  maxPoints: 4096,
  maxPipeM: 4800,
  minSegmentM: 0.1,
  minPipeM: 8,
  shoreSlope: 1.5,
  shoreHeightDifferenceM: 16,
  intakeLengthM: 32,
  intakeDepthM: 1,
  undergroundDepthM: 4,
  terrainOpacity: 0.35,
  pipeRadiusM: 1,
  coverageOpacity: 0.08,
  graphCellM: 64,
} as const;
export type WaterFacilityId = (typeof WATER_UTILITY.facilityIds)[number];
