import { Rng } from '../core/rng';
import { TERRAIN_DETAIL } from '../data/terrain';

/** Original periodic 512² grayscale maps packed R=grass G=dirt B=rock A=sand. */
export function terrainDetailPixels(
  size: number = TERRAIN_DETAIL.size,
  seed: number = TERRAIN_DETAIL.seed,
): Uint8Array {
  if (
    !Number.isInteger(size) ||
    size < 8 ||
    size > 1024 ||
    (size & (size - 1)) !== 0
  )
    throw new RangeError('Texture size must be a power of two from 8 to 1024');
  const rng = new Rng(seed),
    output = new Uint8Array(size * size * 4);
  const lattice = Array.from({ length: 3 }, (_, octave) => {
    const cells = 4 << (octave * 2);
    return {
      cells,
      values: Float32Array.from({ length: cells * cells }, () => rng.next()),
    };
  });
  const sample = (x: number, y: number, octave: number) => {
    const { cells, values } = lattice[octave]!;
    x = (x / size) * cells;
    y = (y / size) * cells;
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const sx = x - ix,
      sy = y - iy,
      u = sx * sx * (3 - 2 * sx),
      v = sy * sy * (3 - 2 * sy);
    const at = (a: number, b: number) =>
      values[
        (((b % cells) + cells) % cells) * cells +
          (((a % cells) + cells) % cells)
      ]!;
    const a = at(ix, iy) * (1 - u) + at(ix + 1, iy) * u;
    const b = at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u;
    return a * (1 - v) + b * v;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const broad = sample(x, y, 0),
        grain = sample(x, y, 2),
        clumps = sample(x, y, 1);
      const blade = sample(x, y * 4, 2),
        ridge = Math.abs(clumps * 2 - 1);
      const offset = (y * size + x) * 4;
      output[offset] = Math.round((blade * 0.65 + grain * 0.35) * 255);
      output[offset + 1] = Math.round((clumps * 0.35 + grain * 0.65) * 255);
      output[offset + 2] = Math.round(
        (ridge * 0.65 + broad * 0.25 + grain * 0.1) * 255,
      );
      output[offset + 3] = Math.round((grain * 0.7 + broad * 0.3) * 255);
    }
  return output;
}
