import { POWER, type PowerPlantId } from '../data/power';
import type { PowerToolState } from '../tools/placeTool';
import { t } from './i18n/t';
export function createPowerControls(
  parent: HTMLElement,
  actions: {
    plant(id: PowerPlantId): void;
    line(): void;
    rotate(): void;
    confirm(): void;
    cancel(): void;
  },
) {
  const host = document.createElement('div');
  host.className = 'power-controls';
  const row = document.createElement('div');
  row.className = 'road-row';
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('power.type'));
  for (const id of POWER.plantIds) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = t(`power.${id}`);
    select.append(o);
  }
  const line = document.createElement('option');
  line.value = 'line';
  line.textContent = t('power.line');
  select.append(line);
  select.onchange = () =>
    select.value === 'line'
      ? actions.line()
      : actions.plant(select.value as PowerPlantId);
  const make = (key: Parameters<typeof t>[0], run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(key);
    b.onclick = run;
    return b;
  };
  const rotate = make('power.rotate', actions.rotate),
    confirm = make('power.confirm', actions.confirm),
    cancel = make('power.cancel', actions.cancel);
  const output = document.createElement('output');
  output.className = 'power-metrics';
  const hint = document.createElement('p');
  hint.className = 'power-hint';
  hint.setAttribute('role', 'status');
  row.append(select, rotate, confirm, cancel);
  host.append(row, output, hint);
  parent.append(host);
  return {
    update(s: PowerToolState) {
      if (!s.active) return;
      host.dataset.valid = String(!!s.preview?.valid);
      host.dataset.pending = String(s.pending);
      host.dataset.rotation = String(s.rotation);
      host.dataset.output = String(s.preview?.output ?? 0);
      host.dataset.cost = String(s.preview?.cost ?? 0);
      select.value = s.line ? 'line' : s.defId;
      select.disabled = s.pending;
      rotate.disabled = s.pending;
      rotate.hidden = s.line;
      confirm.disabled = !s.ready || s.pending || !s.preview?.valid;
      cancel.disabled = s.pending;
      const p = s.preview;
      output.textContent = p
        ? `${t('road.cost')} $${p.cost} · ${s.line ? t('power.line') : t('power.output') + ' ' + p.output.toFixed(2) + ' MW'}`
        : t('power.reach');
      const reason = s.reason ?? p?.reason;
      hint.textContent = s.pending
        ? t('road.pending')
        : reason
          ? t(reason)
          : t(s.line ? 'power.lineHint' : 'power.placeHint');
      hint.dataset.invalid = String(!!reason);
    },
    dispose() {
      host.remove();
    },
  };
}
