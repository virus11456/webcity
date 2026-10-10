import type { TerrainPick } from '../world/picking';
import { t } from './i18n/t';

/** Diagnostic readout accepts plain world data, never Three objects. */
export function createPickingDebug(parent: HTMLElement) {
  const panel = document.createElement('aside');
  panel.className = 'picking-debug';
  panel.setAttribute('aria-label', t('pick.title'));
  const text = document.createTextNode(t('pick.hint'));
  panel.append(text);
  parent.append(panel);
  return {
    update(hit: TerrainPick | null): void {
      panel.dataset.hit = String(hit !== null);
      if (!hit) {
        text.data = t('pick.hint');
        delete panel.dataset.cell;
        delete panel.dataset.owned;
        return;
      }
      panel.dataset.cell = String(hit.cell.index);
      panel.dataset.owned = String(hit.owned);
      text.data = `${t('pick.position')} ${hit.world.x.toFixed(1)}, ${hit.world.z.toFixed(1)}\n${t('pick.height')} ${hit.world.y.toFixed(2)} m\n${t('pick.cell')} ${hit.cell.x}, ${hit.cell.z}\n${t('pick.tile')} ${hit.tile.x}, ${hit.tile.z} · ${t(hit.owned ? 'pick.owned' : 'pick.unowned')}`;
    },
    dispose(): void {
      panel.remove();
    },
  };
}
