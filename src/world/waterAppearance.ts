import { WATER_DETAIL as D } from '../data/water';
/** Original periodic tangent-space waves; derivatives wrap smoothly at both edges. */
export function waterNormalPixels(): Uint8Array {
  const size = D.normalSize,
    output = new Uint8Array(size * size * 4);
  const tau = Math.PI * 2;
  const at = (x: number, y: number) => {
    const u = x / size,
      v = y / size;
    return (
      Math.sin(tau * (2 * u + 3 * v) + 0.3 * Math.sin(tau * u)) * 0.5 +
      Math.sin(tau * (5 * u - v)) * 0.2 +
      Math.sin(tau * (7 * u + 4 * v)) * 0.1
    );
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 4;
      const ny = (at(x, y - 1) - at(x, y + 1)) * 4;
      const length = Math.hypot(nx, ny, 1),
        offset = (y * size + x) * 4;
      output[offset] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      output[offset + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      output[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      output[offset + 3] = 255;
    }
  return output;
}
