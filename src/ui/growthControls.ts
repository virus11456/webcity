import type { SimClient } from '../bridge/simClient';
import type { Building } from '../world/types';
import { t } from './i18n/t';

/** A small event-fed summary; no terrain copies or per-frame DOM updates. */
export function createGrowthControls(
  parent: HTMLElement,
  sim: SimClient,
  view: (b: Building) => void,
) {
  const host = document.createElement('div');
  host.className = 'growth-controls';
  const summary = document.createElement('output');
  summary.className = 'growth-summary';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = t('growth.view');
  const hint = document.createElement('small');
  hint.textContent = t('growth.hint');
  host.append(summary, button, hint);
  parent.append(host);
  const buildings = new Map(sim.mirror.readBuildings().map((b) => [b.id, b]));
  const update = () => {
    const all = [...buildings.values()],
      construction = all.filter((b) => b.state === 'construction').length,
      active = all.filter((b) => b.state === 'active').length,
      rezone = all.filter((b) => b.rezoneAtTick !== undefined).length;
    host.dataset.construction = String(construction);
    host.dataset.active = String(active);
    host.dataset.rezone = String(rezone);
    summary.textContent = `${t('growth.construction')} ${construction} · ${t('growth.active')} ${active} · ${t('growth.rezone')} ${rezone}`;
    button.disabled = !all.length;
  };
  button.addEventListener('click', () => {
    const all = [...buildings.values()],
      b = all.find((b) => b.state === 'construction') ?? all[0];
    if (b) view(b);
  });
  const unsubscribe = sim.onEvent((e) => {
    if (e.t === 'ready') {
      buildings.clear();
      for (const b of sim.mirror.readBuildings()) buildings.set(b.id, b);
      update();
    }
    if (e.t !== 'buildingsChanged') return;
    let changed = Boolean(e.added.length || e.removed.length);
    for (const b of e.added) buildings.set(b.id, structuredClone(b));
    for (const p of e.updated) {
      const b = buildings.get(p.id);
      if (!b) continue;
      if (
        (p.state !== undefined && p.state !== b.state) ||
        (Object.hasOwn(p, 'rezoneAtTick') && p.rezoneAtTick !== b.rezoneAtTick)
      )
        changed = true;
      Object.assign(b, p);
    }
    for (const id of e.removed) buildings.delete(id);
    if (changed) update();
  });
  update();
  return {
    dispose() {
      unsubscribe();
      host.remove();
    },
  };
}
