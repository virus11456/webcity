import { Rng } from '../core/rng';
import { ROAD_DETAIL as D } from '../data/roadDetail';

/** R: asphalt aggregate, G: staggered paving. Both repeat seamlessly; no external art. */
export function roadDetailPixels(): Uint8Array {
  const pixels = new Uint8Array(D.size * D.size * 4),
    rng = new Rng(D.seed);
  const cell = (D.pavingM / D.repeatM) * D.size;
  const joint = (D.jointM / D.repeatM) * D.size;
  for (let y = 0; y < D.size; y++)
    for (let x = 0; x < D.size; x++) {
      const offset = (y * D.size + x) * 4;
      const row = Math.floor(y / cell),
        sx = (x + ((row % 2) * cell) / 2) % cell;
      const edge = Math.min(sx, cell - sx, y % cell, cell - (y % cell));
      pixels[offset] = Math.round(rng.next() * 255);
      pixels[offset + 1] =
        edge < joint ? 20 : 175 + Math.floor(rng.next() * 55);
      pixels[offset + 2] = 128;
      pixels[offset + 3] = 255;
    }
  return pixels;
}
