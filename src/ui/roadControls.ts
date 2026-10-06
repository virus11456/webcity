import { ROADS, type RoadTypeId } from '../data/roads';
import type { RoadToolState } from '../tools/roadTool';
import { t } from './i18n/t';

interface RoadActions {
  enter(): void;
  explore(): void;
  zone(): void;
  bulldoze(): void;
  demo(): void;
  confirm(): void;
  cancel(): void;
  type(type: RoadTypeId): void;
  angle(enabled: boolean): void;
}
/** Accessible construction controls; geometry and worker authority stay outside the UI layer. */
export function createRoadControls(parent: HTMLElement, actions: RoadActions) {
  const panel = document.createElement('section');
  panel.className = 'road-controls';
  panel.setAttribute('aria-label', t('road.title'));
  const button = (key: Parameters<typeof t>[0], run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(key);
    b.addEventListener('click', run);
    return b;
  };
  let construction = false;
  let zoneActive = false,
    zonePending = false;
  let bulldozeActive = false,
    bulldozePending = false;
  let latest: Readonly<RoadToolState> | undefined;
  const enter = button('road.enter', () => {
    construction = true;
    panel.dataset.construction = 'true';
    body.hidden = false;
    enter.hidden = true;
    actions.enter();
  });
  const body = document.createElement('div');
  body.className = 'road-body';
  body.hidden = true;
  const heading = document.createElement('div');
  heading.className = 'road-heading';
  const title = document.createElement('strong');
  title.textContent = t('road.title');
  const money = document.createElement('span');
  money.className = 'road-money';
  heading.append(title, money);
  const tabs = document.createElement('div');
  tabs.className = 'road-row';
  const draw = button('road.draw', actions.enter),
    zones = button('zone.tab', actions.zone),
    bulldoze = button('bulldoze.tab', actions.bulldoze),
    explore = button('road.explore', actions.explore),
    demo = button('road.demo', () => {
      construction = false;
      panel.dataset.construction = 'false';
      body.hidden = true;
      enter.hidden = false;
      actions.demo();
    });
  tabs.append(draw, zones, bulldoze, explore, demo);
  const options = document.createElement('div');
  options.className = 'road-row road-options';
  const typeLabel = document.createElement('label');
  typeLabel.textContent = t('road.type');
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('road.type'));
  for (const type of Object.keys(ROADS) as RoadTypeId[]) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = t(`road.${type}`);
    select.append(option);
  }
  select.addEventListener('change', () =>
    actions.type(select.value as RoadTypeId),
  );
  typeLabel.append(select);
  const angleLabel = document.createElement('label');
  angleLabel.className = 'road-angle';
  const angle = document.createElement('input');
  angle.type = 'checkbox';
  angle.checked = true;
  angle.addEventListener('change', () => actions.angle(angle.checked));
  angleLabel.append(angle, t('road.angle'));
  options.append(typeLabel, angleLabel);
  const metrics = document.createElement('output');
  metrics.className = 'road-metrics';
  const status = document.createElement('p');
  status.className = 'road-status';
  status.setAttribute('role', 'status');
  const confirmRow = document.createElement('div');
  confirmRow.className = 'road-row';
  const confirm = button('road.confirm', actions.confirm),
    cancel = button('road.cancel', actions.cancel);
  confirmRow.append(confirm, cancel);
  const note = document.createElement('small');
  note.textContent = t('road.temporary');
  const details = document.createElement('div');
  details.append(options, metrics, status, confirmRow);
  const zoneHost = document.createElement('div');
  zoneHost.hidden = true;
  const bulldozeHost = document.createElement('div');
  bulldozeHost.hidden = true;
  body.append(heading, tabs, details, zoneHost, bulldozeHost, note);
  panel.append(enter, body);
  parent.append(panel);
  const format = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
  return {
    zoneHost,
    bulldozeHost,
    updateBulldoze(active: boolean, pending: boolean) {
      bulldozeActive = active;
      bulldozePending = pending;
      if (latest) this.update(latest);
    },
    updateZone(active: boolean, pending: boolean) {
      zoneActive = active;
      zonePending = pending;
      if (latest) this.update(latest);
    },
    update(state: Readonly<RoadToolState>) {
      latest = state;
      details.hidden = zoneActive || bulldozeActive;
      bulldozeHost.hidden = !bulldozeActive;
      bulldoze.setAttribute('aria-pressed', String(bulldozeActive));
      bulldoze.disabled =
        !state.ready || state.pending || zonePending || bulldozePending;
      zoneHost.hidden = !zoneActive;
      title.textContent = t(
        bulldozeActive
          ? 'bulldoze.title'
          : zoneActive
            ? 'zone.title'
            : 'road.title',
      );
      zones.setAttribute('aria-pressed', String(zoneActive));
      zones.disabled =
        !state.ready || state.pending || zonePending || bulldozePending;
      panel.dataset.ready = String(state.ready);
      panel.dataset.phase = state.phase;
      panel.dataset.pending = String(state.pending);
      panel.dataset.money = String(state.money);
      panel.dataset.segments = String(state.segments);
      panel.dataset.valid = String(Boolean(state.preview?.canBuild));
      panel.dataset.active = String(state.active);
      enter.disabled = !state.ready || state.pending;
      money.textContent = `${t('road.money')} $${format.format(state.money)}`;
      draw.setAttribute('aria-pressed', String(state.active));
      explore.setAttribute(
        'aria-pressed',
        String(!state.active && !zoneActive && !bulldozeActive),
      );
      draw.disabled =
        !state.ready || state.pending || zonePending || bulldozePending;
      explore.disabled = demo.disabled =
        state.pending || zonePending || bulldozePending;
      options.hidden = !state.active;
      select.disabled = state.pending;
      angle.disabled = state.pending;
      select.value = state.type;
      angle.checked = state.angleSnap;
      for (const option of select.options) {
        const type = option.value as RoadTypeId;
        option.disabled = !state.unlocked.includes(ROADS[type].unlock);
        option.textContent =
          t(`road.${type}`) + (option.disabled ? ` · ${t('road.locked')}` : '');
      }
      confirm.disabled =
        !state.ready || state.pending || !state.preview?.canBuild;
      confirm.hidden = !state.active || !state.preview;
      cancel.disabled = state.pending;
      cancel.hidden = !state.active || state.phase === 'start';
      const p = state.preview?.preview;
      metrics.textContent = p
        ? `${t('road.length')} ${p.length.toFixed(0)} m · ${t('road.cost')} $${format.format(p.cost)} · ${t('road.slope')} ${(p.slope * 100).toFixed(1)}%`
        : `${t('road.count')} ${state.segments}`;
      panel.dataset.cost = String(p?.cost ?? 0);
      const reason = state.reason ?? state.preview?.reason;
      status.dataset.invalid = String(Boolean(reason));
      status.textContent = state.pending
        ? t('road.pending')
        : reason
          ? t(reason)
          : !state.ready
            ? t('sim.loading')
            : !state.active
              ? t('road.exploreHint')
              : state.phase === 'start'
                ? t('road.start')
                : state.phase === 'end'
                  ? t('road.end')
                  : t('road.confirmHint');
      if (!construction) body.hidden = true;
    },
    dispose() {
      panel.remove();
    },
  };
}
