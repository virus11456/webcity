import { buildingProblemIcons } from '../world/buildingProblems';
import { PROBLEMS } from '../data/simulation';
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
    power = document.createElement('span'),
    water = document.createElement('span');
  people.append(homes, jobs, flow, power, water);
  const population = (stats: CityStats | undefined) => {
    const p = stats?.populationDetails;
    const e = stats?.power;
    power.textContent = `${t('power.summary')} ${(e?.produced ?? 0).toFixed(2)} / ${(e?.consumed ?? 0).toFixed(2)} / ${(e?.served ?? 0).toFixed(2)} · ${t('power.unpowered')} ${e?.unpowered ?? 0}`;
    power.className = 'power-summary';
    water.className = 'power-summary';
    water.textContent = `${t('water.summary')} ${stats?.water.produced ?? 0}/${stats?.water.consumed ?? 0}/${stats?.water.served ?? 0} · ${t('water.sewage')} ${stats?.sewage.capacity ?? 0}/${stats?.sewage.produced ?? 0}/${stats?.sewage.treated ?? 0} · ${t('water.unserved')} ${stats?.water.unserved ?? 0} · ${t('water.uncollected')} ${stats?.sewage.uncollected ?? 0}`;
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
  const problemPanel = document.createElement('details');
  problemPanel.className = 'building-problems';
  const problems = document.createElement('summary');
  problems.className = 'problem-summary';
  const problemButton = document.createElement('button');
  problemButton.type = 'button';
  problemButton.textContent = t('problem.view');
  const problemDetail = document.createElement('output');
  problemDetail.className = 'problem-detail';
  problemDetail.setAttribute('aria-live', 'polite');
  let selectedProblem: number | undefined;
  const describe = (b: Building) =>
    buildingProblemIcons(b)
      .map((p) =>
        p === 'abandoned'
          ? t('problem.abandoned')
          : `${t(p === 'noGoods' && b.defId === 'I' ? 'problem.noExport' : `problem.${p}`)} ${Math.floor(b.problemTimers[p])}/${PROBLEMS[p].days} ${t('problem.days')}`,
      )
      .join(' · ');
  problemPanel.append(problems, problemButton, problemDetail);
  host.append(summary, button, problemPanel, hint);
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
    const affected = all.filter((b) => buildingProblemIcons(b).length);
    const abandoned = all.filter(
      (b) => b.state === 'abandoned' || b.state === 'burned',
    ).length;
    host.dataset.abandoned = String(abandoned);
    host.dataset.problems = String(affected.length);
    problems.textContent = `${t('problem.summary')} ${affected.length}`;
    problems.title = `${t('problem.abandoned')} ${abandoned}`;
    problemButton.disabled = !affected.length;
    const selected = affected.find((b) => b.id === selectedProblem);
    problemDetail.textContent = selected
      ? `#${selected.id} · ${describe(selected)}`
      : t('problem.hint');
  };
  problemButton.addEventListener('click', () => {
    const affected = [...buildings.values()]
      .filter((b) => buildingProblemIcons(b).length)
      .sort((a, b) => a.id - b.id);
    const next =
      affected[
        (affected.findIndex((b) => b.id === selectedProblem) + 1) %
          affected.length
      ];
    if (next) {
      selectedProblem = next.id;
      update();
      view(next);
    }
  });
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
        p.flags !== undefined ||
        p.crime !== undefined ||
        p.problemTimers !== undefined ||
        Object.hasOwn(p, 'roadDisconnectedDay') ||
        p.jobs !== undefined ||
        p.workers !== undefined ||
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
