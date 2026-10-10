import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  SRGBColorSpace,
} from 'three';
import { Rng } from '../../core/rng';
import {
  BUILDING_FORM as F,
  BUILDING_ZONES,
} from '../../data/buildingAppearance';
import { BUILDING_DETAIL_PALETTE as P } from '../../data/palette';

/** Original canvas windows and a pixel-aligned deterministic emission mask; one shared atlas pair. */
export function createWindowAtlas(seed = 11456) {
  const color = document.createElement('canvas'),
    emission = document.createElement('canvas');
  for (const c of [color, emission]) c.width = c.height = F.atlasSize;
  const c = color.getContext('2d')!,
    e = emission.getContext('2d')!;
  if (!c || !e) throw new Error('Canvas 2D unavailable');
  c.fillStyle = P.atlasWhite;
  c.fillRect(0, 0, F.atlasSize, F.atlasSize);
  e.fillStyle = P.atlasBlack;
  e.fillRect(0, 0, F.atlasSize, F.atlasSize);
  const rng = new Rng(seed),
    tile = F.atlasSize / F.atlasCells;
  for (const [row, zone] of BUILDING_ZONES.entries())
    for (let v = 0; v < F.windowVariants; v++) {
      const x = v * tile,
        y = (row + 1) * tile;
      const storefront = zone === 'CL' || zone === 'CH',
        curtain = zone === 'O';
      const columns = curtain ? 5 : storefront ? 3 : v % 2 ? 4 : 3;
      const pad = curtain ? 5 : storefront ? 10 : 18,
        top = curtain ? 5 : storefront ? 20 : 28;
      for (let n = 0; n < columns; n++) {
        const wx = x + pad + (n * (tile - pad * 2)) / columns,
          wy = y + top;
        const ww = (tile - pad * 2) / columns - (curtain ? 3 : 7),
          wh = tile - top - (curtain ? 5 : 22);
        c.fillStyle = P.frame;
        c.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        c.fillStyle = P.glass;
        c.fillRect(wx, wy, ww, wh);
        c.fillStyle = P.frame;
        if (!curtain) c.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        if (v === 3) c.fillRect(wx, wy + wh * 0.6, ww, 2);
        const probability =
          zone === 'I' ? 0.2 : zone === 'O' ? 0.5 : 0.3 + v * 0.12;
        if (rng.next() < probability) {
          e.fillStyle = P.atlasWhite;
          e.fillRect(wx, wy, ww, wh);
          if (!curtain) {
            e.fillStyle = P.atlasBlack;
            e.fillRect(wx + ww / 2 - 1, wy, 2, wh);
          }
          if (v === 3) {
            e.fillStyle = P.atlasBlack;
            e.fillRect(wx, wy + wh * 0.6, ww, 2);
          }
        }
      }
    }
  const map = new CanvasTexture(color),
    emissiveMap = new CanvasTexture(emission);
  map.colorSpace = SRGBColorSpace;
  emissiveMap.colorSpace = NoColorSpace;
  for (const t of [map, emissiveMap]) {
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = 4;
  }
  return {
    map,
    emissiveMap,
    color,
    emission,
    dispose() {
      map.dispose();
      emissiveMap.dispose();
    },
  };
}
export type WindowAtlas = ReturnType<typeof createWindowAtlas>;
