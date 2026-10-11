import { MAP_TILES, SEA_LEVEL, MAP_SIZE } from '../data/config';
import { ENVIRONMENT_PALETTE as P, ROAD_PALETTE } from '../data/palette';
import { previewTile, tileAllowance, tilePrice } from '../world/tiles';
import type { SimClient } from '../bridge/simClient';
import { createIcon } from './icons';
import { t } from './i18n/t';
import './styles/tiles.css';
export function createTileControls(parent: HTMLElement, sim: SimClient) {
  const trigger = document.createElement('button');
  trigger.append(createIcon('layers'), t('tiles.title'));
  trigger.className = 'tiles-trigger';
  (parent.querySelector('.road-tabs') ?? parent).append(trigger);
  const dialog = document.createElement('dialog');
  dialog.className = 'finance-dialog tiles-dialog';
  dialog.setAttribute('aria-label', t('tiles.title'));
  const heading = document.createElement('h1');
  heading.textContent = t('tiles.title');
  const close = document.createElement('button');
  close.textContent = t('tiles.close');
  close.onclick = () => dialog.close();
  const summary = document.createElement('p'),
    hint = document.createElement('p'),
    map = document.createElement('div'),
    canvas = document.createElement('canvas'),
    thumbnail = document.createElement('img'),
    grid = document.createElement('div'),
    status = document.createElement('output'),
    buy = document.createElement('button');
  summary.className = 'tiles-summary';
  hint.textContent = t('tiles.hint');
  map.className = 'tiles-map';
  grid.className = 'tiles-grid';
  canvas.width = canvas.height = 300;
  thumbnail.alt = '';
  thumbnail.setAttribute('aria-hidden', 'true');
  status.setAttribute('role', 'status');
  status.className = 'tiles-status';
  buy.textContent = t('tiles.buy');
  map.append(thumbnail, grid);
  dialog.append(heading, close, summary, hint, map, status, buy);
  parent.append(dialog);
  let selected: number | undefined,
    pending = false;
  const cells = Array.from({ length: MAP_TILES ** 2 }, (_, id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tile = String(id);
    b.setAttribute(
      'aria-label',
      `${t('tiles.tile')} ${(id % MAP_TILES) + 1}, ${Math.floor(id / MAP_TILES) + 1}`,
    );
    b.onclick = () => {
      selected = id;
      status.textContent = '';
      update();
    };
    grid.append(b);
    return b;
  });
  function update() {
    const w = sim.mirror.readTileWorld();
    if (!w) return;
    summary.textContent = `${t('tiles.owned')} ${w.ownedTiles.length} / ${tileAllowance(w)} · ${t('tiles.deviceLimit')} ${w.tileLimit} · $${w.money.toLocaleString('zh-TW')}`;
    cells.forEach((b, id) => {
      const owned = w.ownedTiles.includes(id);
      b.dataset.owned = String(owned);
      b.setAttribute('aria-pressed', String(selected === id));
      b.disabled = pending;
      b.textContent = owned ? t('tiles.ownedShort') : String(id + 1);
    });
    const q =
      selected === undefined
        ? undefined
        : previewTile(
            w,
            selected % MAP_TILES,
            Math.floor(selected / MAP_TILES),
          );
    buy.disabled = pending || !q?.ok;
    buy.textContent = `${t('tiles.buy')} · $${(q?.cost ?? (w.settings.mode === 'sandbox' ? 0 : tilePrice(w.ownedTiles.length))).toLocaleString('zh-TW')}`;
    if (q?.reason) status.textContent = t(q.reason);
  }
  function drawMap() {
    const s = sim.mirror.readSnapshot(),
      c = canvas.getContext('2d');
    if (!s || !c) return;
    const size = Math.sqrt(s.terrain.heights.length);
    for (let z = 0; z < 300; z++)
      for (let x = 0; x < 300; x++) {
        const h =
          s.terrain.heights[
            Math.round((z / 299) * (size - 1)) * size +
              Math.round((x / 299) * (size - 1))
          ]!;
        c.fillStyle =
          h < SEA_LEVEL
            ? P.water_deep
            : h > 180
              ? P.rock
              : h > 100
                ? P.grass_dark
                : P.grass;
        c.fillRect(x, z, 1, 1);
      }
    const nodes = new Map(s.nodes.map((n) => [n.id, n]));
    c.strokeStyle = ROAD_PALETTE.asphalt;
    c.lineWidth = 1.5;
    for (const segment of s.segments) {
      const a = nodes.get(segment.start),
        b = nodes.get(segment.end);
      if (!a || !b) continue;
      c.beginPath();
      c.moveTo(
        (a.pos.x / MAP_SIZE + 0.5) * 300,
        (a.pos.z / MAP_SIZE + 0.5) * 300,
      );
      c.lineTo(
        (b.pos.x / MAP_SIZE + 0.5) * 300,
        (b.pos.z / MAP_SIZE + 0.5) * 300,
      );
      c.stroke();
    }
    thumbnail.src = canvas.toDataURL('image/png');
  }
  buy.onclick = async () => {
    if (selected === undefined || pending) return;
    pending = true;
    update();
    try {
      const r = await sim.send({
        t: 'buyTile',
        tx: selected % MAP_TILES,
        tz: Math.floor(selected / MAP_TILES),
      });
      status.textContent =
        r.t === 'result' && r.ok
          ? t('tiles.purchased')
          : r.t === 'result' && r.reason
            ? t(r.reason)
            : t('sim.failed');
    } catch {
      status.textContent = t('sim.failed');
    } finally {
      pending = false;
      const message = status.textContent;
      update();
      status.textContent = message;
    }
  };
  trigger.onclick = () => {
    selected = undefined;
    status.textContent = '';
    drawMap();
    update();
    dialog.showModal();
  };
  const stop = sim.onEvent((e) => {
    if (
      ['ready', 'tilesChanged', 'milestone', 'fundsChanged'].includes(e.t) &&
      dialog.open
    )
      update();
  });
  return {
    dispose() {
      stop();
      dialog.remove();
      trigger.remove();
    },
  };
}
