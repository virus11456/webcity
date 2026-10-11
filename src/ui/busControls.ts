import { TRAM } from '../data/tram';
import { METRO } from '../data/metro';
import { metroTrackCost } from '../world/metro';
import { TRANSIT } from '../data/transit';
import { TRANSIT as CAPACITY } from '../data/buildings';
import type { BusTool, BusToolState } from '../tools/busTool';
import { ZONE_PALETTE } from '../data/palette';
import { createIcon } from './icons';
import { t } from './i18n/t';
export function createBusControls(
  parent: HTMLElement,
  tool: BusTool,
  depot: () => void,
) {
  const host = document.createElement('div');
  host.className =
    tool.mode === 'metro'
      ? 'metro-controls'
      : tool.mode === 'tram'
        ? 'tram-controls'
        : 'bus-controls';
  const button = (key: Parameters<typeof t>[0], run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(key);
    b.onclick = run;
    return b;
  };
  const row = document.createElement('div');
  row.className = 'road-row';
  const build = button(
      tool.mode === 'metro' ? 'metro.station' : 'bus.depot',
      depot,
    ),
    finish = button(
      tool.mode === 'metro'
        ? 'metro.finish'
        : tool.mode === 'tram'
          ? 'tram.finish'
          : 'bus.finish',
      () => tool.onConfirm(),
    ),
    cancel = button('bus.cancel', () => tool.clearDraft());
  build.prepend(createIcon('bus'));
  row.append(build, finish, cancel);
  const hint = document.createElement('p');
  hint.className = 'power-hint';
  hint.textContent = `${t(tool.mode === 'metro' ? 'metro.hint' : tool.mode === 'tram' ? 'tram.hint' : 'bus.hint')} ${t('bus.fareCapacity')} $${tool.mode === 'metro' ? METRO.fare : tool.mode === 'tram' ? TRAM.fare : TRANSIT.fare} / ${tool.mode === 'metro' ? CAPACITY.metroPassengers : tool.mode === 'tram' ? TRAM.passengers : CAPACITY.busPassengers}`;
  const status = document.createElement('output');
  status.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'bus-lines';
  host.append(row, hint, status, list);
  parent.append(host);
  let signature = '';
  return {
    update(s: BusToolState) {
      host.dataset.pending = String(s.pending);
      host.dataset.stops = String(s.stops.length);
      build.disabled = cancel.disabled = s.pending;
      finish.disabled = s.pending || s.stops.length < 2;
      if (tool.mode === 'tram')
        finish.textContent =
          s.quote === undefined
            ? t('tram.quote')
            : `${t('tram.finish')} $${s.quote}`;
      status.textContent = s.reason
        ? t(s.reason)
        : `${t('bus.stops')} ${s.stops.length}${tool.mode === 'metro' && s.stops.length > 1 ? ` · ${t('metro.cost')} $${metroTrackCost(s.stops)}` : ''}`;
      // Do not replace focused buttons on every stream event.
      const key = JSON.stringify([s.lines, s.pending]);
      if (key === signature) return;
      signature = key;
      const focused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.dataset.busAction
          : undefined;
      list.replaceChildren();
      if (!s.lines.length) {
        const p = document.createElement('p');
        p.textContent = t(tool.mode === 'metro' ? 'metro.empty' : 'bus.empty');
        list.append(p);
      }
      for (const l of s.lines) {
        const card = document.createElement('section');
        card.className = 'bus-line';
        card.dataset.line = String(l.id);
        const title = document.createElement('strong');
        title.textContent = `${t('bus.line')} ${l.id} · ${l.length.toFixed(0)} m`;
        title.style.borderLeftColor =
          Object.values(ZONE_PALETTE)[l.color]!.normal;
        const values = document.createElement('p');
        values.textContent = `${t(l.blocked ? (tool.mode === 'metro' ? 'metro.blocked' : 'bus.blocked') : 'bus.running')} · ${t('bus.vehicles')} ${l.vehicles} · ${t('bus.waiting')} ${l.waiting} · ${t('bus.onboard')} ${l.onboard}`;
        const stats = document.createElement('p');
        stats.className = 'bus-stats';
        stats.textContent = `${t('bus.week')} ${l.passengers} / $${l.revenue} · ${t('bus.lastWeek')} ${l.lastPassengers} / $${l.lastRevenue}`;
        const buttons = document.createElement('div');
        buttons.className = 'road-row';
        for (const [key, run] of [
          [
            'bus.add',
            () =>
              void tool.command({
                t: 'setBusVehicles',
                id: l.id,
                vehicles: l.vehicles + 1,
              }),
          ],
          [
            'bus.remove',
            () =>
              void tool.command({
                t: 'setBusVehicles',
                id: l.id,
                vehicles: Math.max(0, l.vehicles - 1),
              }),
          ],
          [
            'bus.delete',
            () => void tool.command({ t: 'deleteBusLine', id: l.id }),
          ],
        ] as const) {
          if (tool.mode === 'metro' && key !== 'bus.delete') continue;
          const b = button(
            tool.mode === 'tram' && key === 'bus.add'
              ? 'tram.add'
              : tool.mode === 'tram' && key === 'bus.remove'
                ? 'tram.remove'
                : key,
            run,
          );
          b.dataset.busAction = `${l.id}:${key}`;
          b.disabled = s.pending || (key === 'bus.remove' && l.vehicles === 0);
          buttons.append(b);
        }
        card.append(title, values, stats, buttons);
        list.append(card);
      }
      if (focused)
        list
          .querySelector<HTMLElement>(`[data-bus-action="${focused}"]`)
          ?.focus({ preventScroll: true });
    },
    dispose() {
      host.remove();
    },
  };
}
