import { WATER_UTILITY } from '../data/waterUtility';
import type { WaterMode, WaterToolState } from '../tools/waterTool';
import { t } from './i18n/t';
import { createBuildCatalog } from './buildCatalog';
export function createWaterControls(
  parent: HTMLElement,
  actions: {
    mode(mode: WaterMode): void;
    rotate(): void;
    confirm(): void;
    cancel(): void;
  },
) {
  const host = document.createElement('div');
  host.className = 'water-controls';
  const row = document.createElement('div');
  row.className = 'road-row';
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('water.type'));
  for (const id of [...WATER_UTILITY.facilityIds, 'pipe'] as const) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = t(`water.${id}`);
    select.append(o);
  }
  select.onchange = () => actions.mode(select.value as WaterMode);
  const make = (key: Parameters<typeof t>[0], run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(key);
    b.onclick = run;
    return b;
  };
  const rotate = make('power.rotate', actions.rotate),
    confirm = make('power.confirm', actions.confirm),
    cancel = make('power.cancel', actions.cancel),
    roads = make('water.roads', () => actions.mode('roads'));
  const output = document.createElement('output');
  output.className = 'power-metrics';
  const hint = document.createElement('p');
  hint.className = 'power-hint';
  hint.setAttribute('role', 'status');
  row.append(select, rotate, confirm, cancel, roads);
  const catalog = createBuildCatalog(select, 'water');
  const actionRow = document.createElement('div');
  actionRow.className = 'road-row tool-actions';
  actionRow.append(rotate, confirm, cancel);
  host.append(catalog.host, row, output, hint, actionRow);
  parent.append(host);
  return {
    update(s: WaterToolState) {
      if (!s.active) return;
      host.dataset.valid = String(!!s.preview?.valid);
      host.dataset.pending = String(s.pending);
      host.dataset.mode = s.mode;
      host.dataset.cost = String(s.preview?.cost ?? 0);
      host.dataset.rotation = String(s.rotation);
      select.value = s.mode === 'roads' ? 'pipe' : s.mode;
      select.disabled = !s.ready || s.pending;
      catalog.update(s.unlocked);
      rotate.hidden = s.mode === 'pipe' || s.mode === 'roads';
      rotate.disabled = cancel.disabled = roads.disabled = s.pending;
      confirm.disabled = !s.ready || s.pending || !s.preview?.valid;
      const p = s.preview;
      output.textContent = p
        ? `${t('road.cost')} $${p.cost} · ${p.closed ? t('water.capacity') + ' ' + p.output + ' ' + t('water.unit') : t('water.reach')}`
        : t('water.reach');
      const reason = s.reason ?? p?.reason;
      hint.dataset.invalid = String(!!reason);
      hint.textContent = s.pending
        ? t('road.pending')
        : reason
          ? t(reason)
          : t(
              s.mode === 'roads'
                ? 'water.roadsHint'
                : s.mode === 'pipe'
                  ? 'water.pipeHint'
                  : 'water.placeHint',
            );
    },
    dispose() {
      host.remove();
    },
  };
}
