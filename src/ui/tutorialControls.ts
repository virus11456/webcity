import type { SimClient } from '../bridge/simClient';
import {
  CAMERA_LESSONS,
  TUTORIAL,
  type CameraLesson,
  type TutorialAction,
} from '../data/tutorial';
import { t } from './i18n/t';
import './styles/tutorial.css';
const targets = [
  'canvas',
  '[data-tutorial="road"]',
  '[data-tutorial="road"]',
  '[data-tutorial="zone"]',
  '[data-tutorial="power"]',
  '[data-tutorial="water"]',
  '.sim-speeds',
  '.finance-trigger',
];
export function createTutorialControls(parent: HTMLElement, sim: SimClient) {
  const panel = document.createElement('aside'),
    details = document.createElement('details'),
    title = document.createElement('summary'),
    body = document.createElement('p'),
    diagram = document.createElement('div'),
    actions = document.createElement('div'),
    locate = document.createElement('button'),
    skip = document.createElement('button'),
    error = document.createElement('output'),
    arrow = document.createElement('span');
  panel.className = 'tutorial-panel';
  panel.setAttribute('aria-label', t('tutorial.title'));
  details.open = true;
  body.setAttribute('aria-live', 'polite');
  diagram.className = 'tutorial-diagram';
  actions.className = 'tutorial-actions';
  error.setAttribute('role', 'status');
  arrow.className = 'tutorial-arrow';
  arrow.textContent = '↓';
  arrow.setAttribute('aria-hidden', 'true');
  locate.textContent = t('tutorial.locate');
  skip.textContent = t('tutorial.skip');
  details.append(title, body, diagram);
  actions.append(locate, skip);
  panel.append(details, actions, error);
  parent.append(panel, arrow);
  const touch = matchMedia('(pointer: coarse)');
  let signature = '',
    pending = false,
    target: HTMLElement | null = null;
  let current = sim.mirror.readTutorial();
  const sent = new Set<CameraLesson>();
  const clearTarget = () => {
    target?.classList.remove('tutorial-target');
    target = null;
    arrow.hidden = true;
  };
  function point() {
    if (!target || panel.hidden || !target.getClientRects().length) {
      arrow.hidden = true;
      return;
    }
    if (target.tagName === 'CANVAS') {
      arrow.hidden = false;
      arrow.style.left = `${innerWidth / 2 - 12}px`;
      arrow.style.top = `${Math.max(panel.getBoundingClientRect().bottom + 8, innerHeight / 2)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    arrow.hidden =
      r.bottom <= 0 ||
      r.top >= innerHeight ||
      r.right <= 0 ||
      r.left >= innerWidth;
    arrow.style.left = `${Math.max(16, Math.min(innerWidth - 32, r.left + r.width / 2 - 12))}px`;
    arrow.style.top = `${Math.max(0, r.top - 30)}px`;
  }
  function highlight(scroll = false) {
    clearTarget();
    const state = sim.mirror.readTutorial();
    if (!state || state.status !== 'active') return;
    target = parent.querySelector<HTMLElement>(targets[state.step]!);
    if (target && !target.getClientRects().length)
      target = parent.querySelector('[data-tutorial="enter"]');
    if (target?.tagName !== 'CANVAS') target?.classList.add('tutorial-target');
    if (scroll) target?.scrollIntoView({ block: 'nearest', inline: 'center' });
    point();
  }
  function update() {
    const state = (current = sim.mirror.readTutorial());
    panel.hidden = !state || state.status === 'skipped' || state.dismissed;
    if (!state || panel.hidden) {
      clearTarget();
      return;
    }
    panel.dataset.step = String(state.step);
    panel.dataset.camera = String(state.camera);
    const next = `${state.status}:${state.step}:${state.camera}:${touch.matches}`;
    if (signature === next) return;
    signature = next;
    title.textContent =
      state.status === 'completed'
        ? t('tutorial.complete')
        : `${t('tutorial.title')} · ${state.step + 1}/${TUTORIAL.steps}`;
    body.textContent =
      state.status === 'completed'
        ? `${t('tutorial.reward')} $${TUTORIAL.reward.toLocaleString('zh-TW')}`
        : t(`tutorial.step${state.step}` as Parameters<typeof t>[0]);
    diagram.replaceChildren();
    if (state.step === 0)
      CAMERA_LESSONS.forEach((lesson, i) => {
        const item = document.createElement('p');
        item.textContent = `${state.camera & (1 << i) ? '✓' : ['⇄', '↻', '↔'][i]} ${t(`tutorial.${touch.matches ? 'touch' : 'mouse'}.${lesson}`)}`;
        item.dataset.done = String(!!(state.camera & (1 << i)));
        diagram.append(item);
      });
    skip.textContent = t(
      state.status === 'completed' ? 'tutorial.dismiss' : 'tutorial.skip',
    );
    locate.hidden = state.status === 'completed';
    highlight();
  }
  async function send(action: TutorialAction) {
    try {
      const r = await sim.send({ t: 'tutorial', action });
      if (r.t === 'result' && !r.ok) throw new Error('tutorial command failed');
      error.textContent = '';
      return true;
    } catch {
      error.textContent = t('sim.failed');
      return false;
    }
  }
  skip.onclick = async () => {
    if (pending) return;
    pending = true;
    skip.disabled = true;
    await send(
      sim.mirror.readTutorial()?.status === 'completed' ? 'dismiss' : 'skip',
    );
    pending = false;
    skip.disabled = false;
  };
  locate.onclick = () => {
    const step = sim.mirror.readTutorial()?.step;
    if (step === 0) {
      parent.querySelector<HTMLCanvasElement>('canvas')?.focus();
      return;
    }
    const enter = parent.querySelector<HTMLButtonElement>(
      '[data-tutorial="enter"]',
    );
    if (step !== undefined && step >= 1 && step <= 5 && enter && !enter.hidden)
      enter.click();
    highlight(true);
    if (target instanceof HTMLButtonElement) target.click();
    highlight(true);
  };
  const stop = sim.onEvent((e) => {
    if (e.t === 'tutorial' || e.t === 'ready') update();
  });
  const resize = new ResizeObserver(() => highlight());
  resize.observe(parent);
  parent.addEventListener('scroll', point, true);
  touch.addEventListener('change', update);
  update();
  return {
    camera(action: CameraLesson) {
      const state = current;
      if (state?.status !== 'active' || state.step !== 0 || sent.has(action))
        return;
      sent.add(action);
      void send(action).then((ok) => {
        if (!ok) sent.delete(action);
      });
    },
    finance() {
      if (sim.mirror.readTutorial()?.step === 7) void send('finance');
    },
    dispose() {
      stop();
      resize.disconnect();
      touch.removeEventListener('change', update);
      parent.removeEventListener('scroll', point, true);
      clearTarget();
      panel.remove();
      arrow.remove();
    },
  };
}
