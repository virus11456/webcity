import { MAP_SIZE, WORLD } from '../data/config';
import { clamp } from '../core/math';

/** Sample the rendered terrain triangles, using the same diagonal as the chunk meshes. */
export function meshHeightAt(
  heights: Float32Array,
  x: number,
  z: number,
): number {
  const size = WORLD.heightmapVertices;
  const gx = clamp((x + MAP_SIZE / 2) / WORLD.heightmapSpacingM, 0, size - 1);
  const gz = clamp((z + MAP_SIZE / 2) / WORLD.heightmapSpacingM, 0, size - 1);
  const i = Math.min(size - 2, Math.floor(gx)),
    j = Math.min(size - 2, Math.floor(gz));
  const u = gx - i,
    v = gz - j,
    k = j * size + i;
  const a = heights[k]!,
    b = heights[k + 1]!,
    c = heights[k + size]!,
    d = heights[k + size + 1]!;
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
