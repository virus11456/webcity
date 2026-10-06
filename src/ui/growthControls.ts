import type { SimClient } from '../bridge/simClient';
import type { Building, CityStats } from '../world/types';
import { t } from './i18n/t';

/** A small event-fed summary; no terrain copies or per-frame DOM updates. */
export function createGrowthControls(
  parent: HTMLElement,
  sim: SimClient,
  view: (b: Building) => void,
  statsParent: HTMLElement = parent,
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
  const people = document.createElement('output');
  people.className = 'population-summary';
  const homes = document.createElement('span'),
    jobs = document.createElement('span'),
    flow = document.createElement('span'),
    power = document.createElement('span');
  people.append(homes, jobs, flow, power);
  const population = (stats: CityStats | undefined) => {
    const p = stats?.populationDetails;
    const e = stats?.power;
    power.textContent = `${t('power.summary')} ${(e?.produced ?? 0).toFixed(2)} / ${(e?.consumed ?? 0).toFixed(2)} / ${(e?.served ?? 0).toFixed(2)} · ${t('power.unpowered')} ${e?.unpowered ?? 0}`;
    power.className = 'power-summary';
    people.dataset.population = String(stats?.population ?? 0);
    people.dataset.occupied = String(p?.occupiedHouseholds ?? 0);
    people.dataset.jobs = String(p?.jobs ?? 0);
    people.dataset.employed = String(p?.employed ?? 0);
    people.dataset.unemployed = String(p?.unemployed ?? 0);
    people.dataset.movedOut = String(p?.movedOut ?? 0);
    homes.textContent = `${t('population.residents')} ${stats?.population ?? 0} · ${t('population.households')} ${p?.occupiedHouseholds ?? 0}/${p?.households ?? 0}`;
    jobs.textContent = `${t('population.employed')} ${p?.employed ?? 0} · ${t('population.unemployed')} ${p?.unemployed ?? 0} · ${t('population.vacancies')} ${p?.vacancies ?? 0}`;
    flow.textContent = `${t('population.in')} +${p?.movedIn ?? 0} · ${t('population.out')} −${p?.movedOut ?? 0}`;
  };
  population(sim.mirror.readStats());
  host.append(summary, button, hint);
  statsParent.append(people);
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
    if (e.t === 'stats') population(e.stats);
    if (e.t === 'ready') {
      population(e.snapshot.stats);
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
      people.remove();
    },
  };
}
