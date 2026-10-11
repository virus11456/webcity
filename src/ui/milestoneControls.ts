import { MILESTONES } from '../data/milestones';
import type { SimClient } from '../bridge/simClient';
import { createIcon } from './icons';
import { t } from './i18n/t';
import './styles/milestones.css';
/** Celebrations consume Worker events; closing them never grants money or changes speed. */
export function createMilestoneControls(parent: HTMLElement, sim: SimClient) {
  const dialog = document.createElement('dialog');
  dialog.className = 'finance-dialog milestone-dialog';
  dialog.setAttribute('aria-label', t('milestone.title'));
  const badge = createIcon('tower'),
    heading = document.createElement('h1'),
    population = document.createElement('p'),
    reward = document.createElement('p'),
    label = document.createElement('h2'),
    unlocks = document.createElement('p'),
    hint = document.createElement('p'),
    close = document.createElement('button');
  badge.classList.add('milestone-badge');
  reward.className = 'milestone-reward';
  population.className = 'milestone-population';
  unlocks.className = 'milestone-unlocks';
  label.textContent = t('milestone.unlocks');
  hint.textContent = t('milestone.saved');
  close.textContent = t('milestone.continue');
  dialog.append(
    badge,
    heading,
    population,
    reward,
    label,
    unlocks,
    hint,
    close,
  );
  parent.append(dialog);
  const queue: number[] = [],
    seen = new Set<number>();
  let disposed = false;
  const show = () => {
    if (disposed || dialog.open || !queue.length) return;
    const m = MILESTONES.find((m) => m.id === queue[0]);
    if (!m) return;
    dialog.dataset.milestone = String(m.id);
    heading.textContent = `MS${m.id} · ${t(`milestone.name.${m.id}`)}`;
    population.textContent = `${t('hud.population')} ${m.population.toLocaleString('zh-TW')}`;
    reward.textContent = `${t('milestone.reward')} +$${m.reward.toLocaleString('zh-TW')}`;
    unlocks.textContent = t(`milestone.unlocks.${m.id}`);
    dialog.showModal();
    close.focus({ preventScroll: true });
  };
  close.onclick = () => dialog.close();
  dialog.onclose = () => {
    queue.shift();
    show();
  };
  const stop = sim.onEvent((e) => {
    if (e.t === 'ready') {
      queue.length = 0;
      seen.clear();
      e.snapshot.unlocked.forEach((id) => seen.add(id));
      if (dialog.open) dialog.close();
    }
    if (e.t === 'milestone' && !seen.has(e.index)) {
      seen.add(e.index);
      queue.push(e.index);
      show();
    }
  });
  return {
    dispose() {
      disposed = true;
      stop();
      dialog.remove();
    },
  };
}
