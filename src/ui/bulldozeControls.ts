import type { BulldozeToolState } from '../tools/bulldozeTool';
import type { BulldozeKind } from '../world/bulldoze';
import { t } from './i18n/t';

export function createBulldozeControls(
  parent: HTMLElement,
  actions: { kind(k: BulldozeKind): void; cancel(): void },
) {
  const panel = document.createElement('div');
  panel.className = 'bulldoze-controls';
  const row = document.createElement('div');
  row.className = 'road-row';
  const label = document.createElement('label');
  label.textContent = t('bulldoze.filter');
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('bulldoze.filter'));
  for (const kind of ['segment', 'building', 'network'] as const) {
    const option = document.createElement('option');
    option.value = kind;
    option.textContent = t(`bulldoze.${kind}`);
    select.append(option);
  }
  select.addEventListener('change', () =>
    actions.kind(select.value as BulldozeKind),
  );
  label.append(select);
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t('bulldoze.cancel');
  cancel.addEventListener('click', actions.cancel);
  row.append(label, cancel);
  const metrics = document.createElement('output');
  metrics.className = 'bulldoze-metrics';
  const status = document.createElement('p');
  status.className = 'bulldoze-status';
  status.setAttribute('role', 'status');
  const note = document.createElement('p');
  note.className = 'bulldoze-note';
  note.textContent = t('bulldoze.rule');
  panel.append(row, metrics, status, note);
  parent.append(panel);
  const number = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
  return {
    update(s: Readonly<BulldozeToolState>) {
      panel.dataset.pending = String(s.pending);
      panel.dataset.selected = String(s.selected);
      panel.dataset.refund = String(s.refund);
      panel.dataset.removed = String(s.removed);
      panel.dataset.lastRefund = String(s.lastRefund);
      select.value = s.kind;
      select.disabled = s.pending || !s.ready;
      cancel.disabled = s.pending || !s.selected;
      metrics.textContent = s.selected
        ? `${t('bulldoze.selected')} ${s.selected} · ${t('bulldoze.refund')} $${number.format(s.refund)} · ${t('bulldoze.cost')} $${number.format(s.cost)}`
        : `${t('bulldoze.removed')} ${s.removed} · ${t('bulldoze.returned')} $${number.format(s.lastRefund)} · ${t('bulldoze.cost')} $${number.format(s.lastCost)}`;
      status.dataset.invalid = String(Boolean(s.reason));
      status.textContent = s.pending
        ? t('bulldoze.pending')
        : s.reason
          ? t(s.reason)
          : t('bulldoze.hint');
    },
    dispose() {
      panel.remove();
    },
  };
}
