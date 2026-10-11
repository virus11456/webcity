import { useEffect, useState } from 'preact/hooks';
import { MAP_TILES, SEA_LEVEL } from '../../data/config';
import { MAP_SELECTION as M } from '../../data/terrain';
import { ENVIRONMENT_PALETTE as P, UI_PALETTE } from '../../data/palette';
import { resolveMap } from '../../world/mapSelection';
import { Terrain } from '../../world/terrain';
import { t } from '../i18n/t';
import '../styles/mapPreview.css';
/** Offscreen 2D preview; no Worker/WebGL is allocated on the title screen. */
export function MapPreview({ mapId, seed }: { mapId: string; seed: string }) {
  const [preview, setPreview] = useState<{ key: string; src: string } | null>(
    null,
  );
  const key = `${mapId}:${seed}`,
    valid = !!seed.trim() && !!resolveMap(mapId, Number(seed));
  useEffect(() => {
    if (!valid) return;
    const timer = setTimeout(() => {
      const preset = resolveMap(mapId, Number(seed));
      if (!preset) return;
      const terrain = new Terrain(Number(seed), preset),
        canvas = document.createElement('canvas');
      canvas.width = canvas.height = M.previewSize;
      const c = canvas.getContext('2d');
      if (!c) return;
      const size = Math.sqrt(terrain.heights.length);
      for (let z = 0; z < M.previewSize; z++)
        for (let x = 0; x < M.previewSize; x++) {
          const h =
            terrain.heights[
              Math.round((z / (M.previewSize - 1)) * (size - 1)) * size +
                Math.round((x / (M.previewSize - 1)) * (size - 1))
            ]!;
          c.fillStyle =
            h < SEA_LEVEL
              ? P.water_deep
              : h > M.mountainHeight
                ? P.rock
                : h > M.hillHeight
                  ? P.grass_dark
                  : P.grass;
          c.fillRect(x, z, 1, 1);
        }
      const tile = M.previewSize / MAP_TILES;
      c.strokeStyle = UI_PALETTE.text;
      c.lineWidth = M.tileLineWidth;
      c.strokeRect(
        (M.previewSize - tile) / 2,
        (M.previewSize - tile) / 2,
        tile,
        tile,
      );
      setPreview({ key, src: canvas.toDataURL('image/png') });
    }, M.previewDelayMs);
    return () => clearTimeout(timer);
  }, [mapId, seed, key, valid]);
  const description =
    mapId === 'bay'
      ? 'menu.map.bayHint'
      : mapId === 'mountains'
        ? 'menu.map.mountainsHint'
        : mapId === 'random'
          ? 'menu.map.randomHint'
          : 'menu.map.valleyHint';
  return (
    <figure class="map-preview" aria-busy={valid && preview?.key !== key}>
      {valid && preview?.key === key ? (
        <img
          src={preview.src}
          width={M.previewSize}
          height={M.previewSize}
          alt={t('menu.mapPreview')}
          data-map={mapId}
          data-seed={seed}
        />
      ) : (
        <p role="status">{t(valid ? 'menu.mapLoading' : 'menu.mapInvalid')}</p>
      )}
      <figcaption>
        {t(description)}
        <small>{t('menu.mapPreviewHint')}</small>
      </figcaption>
    </figure>
  );
}
