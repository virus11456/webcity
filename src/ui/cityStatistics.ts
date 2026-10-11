import type { SimClient } from '../bridge/simClient';
import { createIcon } from './icons';
import { t } from './i18n/t';
import './styles/cityStatistics.css';
type Key = Parameters<typeof t>[0];
export function createCityStatistics(parent: HTMLElement, sim: SimClient) {
  const trigger = document.createElement('button'),
    dialog = document.createElement('dialog');
  trigger.className = 'city-stats-trigger';
  trigger.append(createIcon('layers'), t('cityStats.title'));
  dialog.className = 'finance-dialog city-stats-dialog';
  dialog.setAttribute('aria-label', t('cityStats.title'));
  const heading = document.createElement('h1'),
    close = document.createElement('button'),
    hint = document.createElement('p');
  heading.textContent = t('cityStats.title');
  close.textContent = t('cityStats.close');
  close.onclick = () => dialog.close();
  hint.textContent = t('cityStats.hint');
  dialog.append(heading, close, hint);
  const values = new Map<string, HTMLElement>();
  function section(key: Key) {
    const s = document.createElement('section'),
      h = document.createElement('h2');
    h.textContent = t(key);
    s.append(h);
    dialog.append(s);
    return s;
  }
  function row(host: HTMLElement, id: string, key: Key, bar = false) {
    const row = document.createElement('div'),
      label = document.createElement('span'),
      value = document.createElement('strong');
    row.className = 'city-stats-row';
    label.textContent = t(key);
    value.dataset.stat = id;
    row.append(label, value);
    host.append(row);
    values.set(id, value);
    if (bar) {
      const progress = document.createElement('progress');
      progress.max = 1;
      progress.value = 0;
      progress.setAttribute('aria-label', t(key));
      row.append(progress);
      return progress;
    }
    return undefined;
  }
  const population = section('cityStats.population');
  for (const id of ['population', 'households', 'movedIn', 'movedOut'] as const)
    row(population, id, `cityStats.${id}`);
  const ageHost = section('cityStats.ages'),
    educationHost = section('cityStats.education');
  const ages = (['child', 'teen', 'adult', 'senior'] as const).map((id, i) =>
    row(ageHost, `age${i}`, `cityStats.${id}`, true)!,
  );
  const education = (['none', 'elementary', 'high', 'university'] as const).map(
    (id, i) => row(educationHost, `education${i}`, `cityStats.${id}`, true)!,
  );
  const employment = section('cityStats.employment');
  for (const id of [
    'availableWorkers',
    'employed',
    'unemployed',
    'unemployment',
    'jobs',
    'vacancies',
  ] as const)
    row(employment, id, `cityStats.${id}`);
  const traffic = section('cityStats.traffic');
  for (const id of ['vehicles', 'speedKmh', 'flow', 'blocked'] as const)
    row(traffic, id, `cityStats.${id}`);
  const trafficHint = document.createElement('p');
  trafficHint.textContent = t('cityStats.trafficHint');
  traffic.append(trafficHint);
  function update() {
    if (!dialog.open) return;
    const s = sim.mirror.readCityStatistics();
    if (!s) return;
    for (const [key, value] of Object.entries(s)) {
      const el = values.get(key);
      if (!el || Array.isArray(value)) continue;
      el.textContent =
        value === null
          ? '—'
          : key === 'unemployment' || key === 'flow'
            ? `${(value * 100).toFixed(1)}%`
            : value.toLocaleString('zh-TW', { maximumFractionDigits: 1 });
    }
    for (const [prefix, counts, bars] of [
      ['age', s.ages, ages],
      ['education', s.education, education],
    ] as const) {
      const total = counts.reduce((a, b) => a + b, 0);
      counts.forEach((n, i) => {
        const ratio = total ? n / total : 0;
        bars[i]!.value = ratio;
        values.get(`${prefix}${i}`)!.textContent =
          `${n.toLocaleString('zh-TW')} · ${(ratio * 100).toFixed(1)}%`;
      });
    }
  }
  trigger.onclick = () => {
    dialog.showModal();
    update();
  };
  (parent.querySelector('.road-tabs') ?? parent).append(trigger);
  parent.append(dialog);
  const stop = sim.onEvent((e) => {
    if (['ready', 'stats', 'roadTraffic'].includes(e.t)) update();
  });
  return {
    dispose() {
      stop();
      dialog.remove();
      trigger.remove();
    },
  };
}
