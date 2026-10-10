import { SERVICES, type ServiceId } from '../data/services';
import type { ServiceToolState } from '../tools/serviceTool';
import { t } from './i18n/t';
import { createBuildCatalog } from './buildCatalog';
export function createServiceControls(
  parent: HTMLElement,
  actions: {
    mode(mode: ServiceId): void;
    rotate(): void;
    confirm(): void;
    cancel(): void;
  },
) {
  const host = document.createElement('div');
  host.className = 'service-controls';
  const row = document.createElement('div');
  row.className = 'road-row';
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('service.type'));
  for (const id of SERVICES.ids) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id === 'tree' ? t('park.brushName') : t(`service.${id}`);
    select.append(o);
  }
  select.onchange = () => actions.mode(select.value as ServiceId);
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
  const catalog = createBuildCatalog(select, 'service');
  const actionRow = document.createElement('div');
  actionRow.className = 'road-row tool-actions';
  actionRow.append(rotate, confirm, cancel);
  host.append(catalog.host, row, output, hint, actionRow);
  parent.append(host);
  return {
    update(s: ServiceToolState) {
      if (!s.active) return;
      host.dataset.valid = String(!!s.preview?.valid);
      host.dataset.pending = String(s.pending);
      host.dataset.mode = s.defId;
      host.dataset.cost = String(s.preview?.cost ?? 0);
      host.dataset.rotation = String(s.rotation);
      select.value = s.defId;
      select.disabled = !s.ready || s.pending;
      catalog.update(s.unlocked);
      rotate.disabled = s.pending || s.defId === 'tree';
      cancel.disabled = s.pending;
      confirm.disabled = !s.ready || s.pending || !s.preview?.valid;
      const p = s.preview;
      host.dataset.reach = String(p?.roads.length ?? 0);
      output.textContent = p
        ? `${t('road.cost')} $${p.cost} · ${t(s.defId.startsWith('park_') || s.defId === 'tree' ? 'park.radius' : 'service.radius')} ${p.radius.toFixed(0)} m${p.trees ? ` · ${p.trees.length} ${t('park.trees')}` : ''}`
        : t('service.hint');
      const reason = s.reason ?? p?.reason;
      hint.dataset.invalid = String(!!reason);
      hint.textContent = s.pending
        ? t('road.pending')
        : reason
          ? t(reason)
          : t(s.defId === 'tree' ? 'park.brushHint' : 'service.hint');
    },
    dispose() {
      host.remove();
    },
  };
}
