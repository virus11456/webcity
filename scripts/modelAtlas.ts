import sharp from 'sharp';
import { Rng } from '../src/core/rng';
import {
  BUILDING_FORM as F,
  BUILDING_ZONES,
} from '../src/data/buildingAppearance';
import { BUILDING_DETAIL_PALETTE as P } from '../src/data/palette';
import type { ZoneType } from '../src/data/zones';
/** Same atlas coordinates as runtime fallback, rendered offline without a DOM. */
export async function modelAtlas(
  zone: ZoneType,
  emissive: boolean,
): Promise<Buffer> {
  const size = F.atlasSize,
    tile = size / F.atlasCells,
    rng = new Rng(11456),
    rects: string[] = [];
  const rect = (x: number, y: number, w: number, h: number, fill: string) =>
    rects.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`,
    );
  rect(0, 0, size, size, emissive ? P.atlasBlack : P.atlasWhite);
  for (const [row, z] of BUILDING_ZONES.entries())
    for (let v = 0; v < F.windowVariants; v++) {
      const x = v * tile,
        y = (row + 1) * tile,
        storefront = z === 'CL' || z === 'CH',
        curtain = z === 'O';
      const columns = curtain ? 5 : storefront ? 3 : v % 2 ? 4 : 3,
        pad = curtain ? 5 : storefront ? 10 : 18,
        top = curtain ? 5 : storefront ? 20 : 28;
      for (let n = 0; n < columns; n++) {
        const wx = x + pad + (n * (tile - pad * 2)) / columns,
          wy = y + top,
          ww = (tile - pad * 2) / columns - (curtain ? 3 : 7),
          wh = tile - top - (curtain ? 5 : 22);
        const lit =
          rng.next() < (z === 'I' ? 0.2 : z === 'O' ? 0.5 : 0.3 + v * 0.12);
        if (z !== zone) continue;
        if (!emissive) {
          rect(wx - 2, wy - 2, ww + 4, wh + 4, P.frame);
          rect(wx, wy, ww, wh, P.glass);
        } else if (lit) rect(wx, wy, ww, wh, P.atlasWhite);
        if (!curtain)
          rect(wx + ww / 2 - 1, wy, 2, wh, emissive ? P.atlasBlack : P.frame);
        if (v === 3)
          rect(wx, wy + wh * 0.6, ww, 2, emissive ? P.atlasBlack : P.frame);
      }
    }
  return (
    sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${rects.join('')}</svg>`,
      ),
    )
      // GLTFLoader disables flipY; bake the CanvasTexture UV convention into the image.
      .flip()
      .png()
      .toBuffer()
  );
}
