import { ZONE_PALETTE } from '../data/palette';
import { ZONES, type ZoneType } from '../data/zones';
import type { ZoneSelectionMode } from '../data/zoneTool';
import type { ZoneToolState } from '../tools/zoneTool';
import { t } from './i18n/t';

interface ZoneActions {
  zone(value: ZoneType | null): void;
  mode(value: ZoneSelectionMode): void;
  cancel(): void;
}
/** Compact controls share the construction toolbar on phone, tablet and desktop. */
export function createZoneControls(parent: HTMLElement, actions: ZoneActions) {
  const panel = document.createElement('div');
  panel.className = 'zone-controls';
  const row = document.createElement('div');
  row.className = 'zone-options';
  const zoneLabel = document.createElement('label');
  zoneLabel.textContent = t('zone.type');
  const zone = document.createElement('select');
  zone.setAttribute('aria-label', t('zone.type'));
  for (const type of [...Object.keys(ZONES), 'clear']) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = t(`zone.${type as ZoneType | 'clear'}`);
    zone.append(option);
  }
  zone.addEventListener('change', () =>
    actions.zone(zone.value === 'clear' ? null : (zone.value as ZoneType)),
  );
  zoneLabel.append(zone);
  const modeLabel = document.createElement('label');
  modeLabel.textContent = t('zone.mode');
  const mode = document.createElement('select');
  mode.setAttribute('aria-label', t('zone.mode'));
  for (const value of ['fill', 'rectangle', 'small', 'large'] as const) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = t(`zone.${value}`);
    mode.append(o);
  }
  mode.addEventListener('change', () =>
    actions.mode(mode.value as ZoneSelectionMode),
  );
  modeLabel.append(mode);
  row.append(zoneLabel, modeLabel);
  const status = document.createElement('p');
  status.className = 'zone-status';
  status.setAttribute('role', 'status');
  const footer = document.createElement('div');
  footer.className = 'road-row';
  const swatch = document.createElement('span');
  swatch.className = 'zone-swatch';
  swatch.setAttribute('aria-hidden', 'true');
  const metrics = document.createElement('output');
  metrics.className = 'zone-metrics';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t('zone.cancel');
  cancel.addEventListener('click', actions.cancel);
  footer.append(swatch, metrics, cancel);
  panel.append(row, status, footer);
  parent.append(panel);
  return {
    update(state: Readonly<ZoneToolState>) {
      panel.dataset.pending = String(state.pending);
      panel.dataset.selected = String(state.selected);
      panel.dataset.painted = String(state.painted);
      zone.value = state.zone ?? 'clear';
      mode.value = state.mode;
      zone.disabled = mode.disabled = !state.ready || state.pending;
      for (const option of zone.options) {
        const type = option.value as ZoneType | 'clear';
        option.disabled =
          type !== 'clear' && !state.unlocked.includes(ZONES[type].unlock);
        option.textContent =
          t(`zone.${type}`) +
          (option.disabled && type !== 'clear'
            ? ` · MS${ZONES[type].unlock} ${t('zone.locked')}`
            : '');
      }
      swatch.style.background = state.zone
        ? ZONE_PALETTE[state.zone].normal
        : 'transparent';
      metrics.textContent = `${t('zone.free')} · ${state.selected ? `${t('zone.selected')} ${state.selected}` : `${t('zone.applied')} ${state.painted}`} ${t('zone.cells')}`;
      cancel.disabled = state.pending || !state.selected;
      status.dataset.invalid = String(Boolean(state.reason));
      status.textContent = state.pending
        ? t('zone.pending')
        : state.reason
          ? t(state.reason)
          : t(`zone.hint.${state.mode}`);
    },
    dispose() {
      panel.remove();
    },
  };
}
