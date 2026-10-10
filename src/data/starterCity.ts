import { MAP_SIZE, TILE_SIZE } from './config';
/** Prefabricated M1 access: regional roads at the map edges, a flat central interchange. */
export const STARTER_CITY = {
  height: 58,
  highwayX: [-432, -384],
  edge: MAP_SIZE / 2,
  cityEdge: TILE_SIZE / 2,
  rampIn: [
    { x: -384, z: -288 },
    { x: -288, z: -192 },
  ],
  rampOut: [
    { x: -288, z: 192 },
    { x: -432, z: 336 },
  ],
} as const;
