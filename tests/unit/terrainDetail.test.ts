import { describe, expect, it } from 'vitest';
import { terrainDetailPixels } from '../../src/world/terrainDetail';
describe('periodic terrain material detail', () => {
  it('generates deterministic, distinct material channels', () => {
    const pixels = terrainDetailPixels(64);
    expect(pixels).toEqual(terrainDetailPixels(64));
    expect(pixels).not.toEqual(terrainDetailPixels(64, 3));
    expect(pixels.length).toBe(64 * 64 * 4);
    expect(new Set(pixels).size).toBeGreaterThan(120);
    expect(pixels.filter((_, i) => i % 4 === 0)).not.toEqual(
      pixels.filter((_, i) => i % 4 === 2),
    );
  });
  it('has no jump at the repeating 512px boundary', () => {
    const size = 512,
      p = terrainDetailPixels(size);
    for (let channel = 0; channel < 4; channel++) {
      let seam = 0,
        inner = 0;
      for (let y = 0; y < size; y++) {
        seam += Math.abs(
          p[y * size * 4 + channel]! - p[(y * size + size - 1) * 4 + channel]!,
        );
        inner += Math.abs(
          p[(y * size + 20) * 4 + channel]! - p[(y * size + 21) * 4 + channel]!,
        );
      }
      expect(seam / size).toBeLessThan(4);
      expect(seam).toBeLessThan(inner * 2 + size);
    }
  });
  it.each([0, 7, 127, 2048, NaN])('rejects invalid size %s', (size) =>
    expect(() => terrainDetailPixels(size)).toThrow(),
  );
});

import { Terrain } from '../../src/world/terrain';
import { TerrainRenderer } from '../../src/render/terrain/terrainRenderer';
import { MAP_PRESETS } from '../../src/data/terrain';
import { Mesh } from 'three';
it('uses identical normals where adjacent terrain chunks meet', () => {
  const terrain = new Terrain(982451, MAP_PRESETS[2]);
  const renderer = new TerrainRenderer(terrain);
  const a = renderer.group.children[0] as Mesh,
    b = renderer.group.children[1] as Mesh;
  const pa = a.geometry.getAttribute('position'),
    pb = b.geometry.getAttribute('position');
  const na = a.geometry.getAttribute('normal'),
    nb = b.geometry.getAttribute('normal');
  let matches = 0;
  for (let i = 0; i < pa.count; i++) {
    if (pa.getX(i) + a.position.x !== b.position.x) continue;
    for (let j = 0; j < pb.count; j++)
      if (pb.getX(j) === 0 && pb.getZ(j) === pa.getZ(i)) {
        expect([na.getX(i), na.getY(i), na.getZ(i)]).toEqual([
          nb.getX(j),
          nb.getY(j),
          nb.getZ(j),
        ]);
        matches++;
      }
  }
  expect(matches).toBeGreaterThan(20);
  renderer.dispose();
});
