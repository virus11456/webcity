import { TrafficKind as K } from './traffic';
/** Display-only catalogue. Metro remains available for the future transit system. */
export const VEHICLE_MODELS = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `veh_car_${i + 1}`,
    kind: K.car,
    variant: i,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `veh_truck_${i + 1}`,
    kind: K.truck,
    variant: i,
  })),
  ...(['bus', 'police', 'fire', 'ambulance', 'garbage', 'hearse'] as const).map(
    (type) => ({ id: `veh_${type}_1`, kind: K[type], variant: 0 }),
  ),
  { id: 'veh_metro_1', kind: 9, variant: 0 },
] as const;
export const VEHICLE_MODEL_STYLE = {
  metro: [2.8, 3.5, 18],
  wheelRadius: 0.32,
  wheelSegments: 8,
  roughness: 0.78,
} as const;
