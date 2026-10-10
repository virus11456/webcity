import { PARKS } from './parks';
/** GDD §10; capacity conversions fill the unspecified service-demand units. */
export const SERVICES = {
  ids: [
    'bus_depot',
    'police_station',
    'police_hq',
    'fire_station',
    'fire_hq',
    'clinic',
    'hospital',
    'school_elementary',
    'school_high',
    'university',
    ...PARKS.ids,
  ],
  peoplePerPoliceCar: 200,
  buildingsPerFireTruck: 40,
  patientFraction: 0.1,
  frontageCells: 4,
  maxSlope: 0.12,
  maxHeightDifferenceM: 2,
} as const;
export type ServiceId = (typeof SERVICES.ids)[number];
