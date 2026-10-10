/** Original M3 art inventory; landmark gameplay/unlocks belong to M4-11. */
export const LANDMARK_MODELS = [
  'city_hall',
  'museum',
  'observatory',
  'stadium',
  'clock_tower',
  'botanical_garden',
  'convention_center',
  'opera_house',
  'science_center',
  'memorial',
  'lighthouse',
  'sky_tower',
] as const;
export const FACILITY_MODEL_RULES = {
  defaultLot: [4, 4],
  hydroLot: [12, 4],
  landmarkLot: [6, 6],
} as const;
