import type { SimClient } from '../bridge/simClient';
import type { SimSpeed } from '../data/config';
import { t } from './i18n/t';

/** Speed controls reflect acknowledged worker state, never a speculative local clock. */
export function createSimControls(parent: HTMLElement, client: SimClient) {
  const panel = document.createElement('section');
  panel.className = 'sim-controls';
  panel.setAttribute('aria-label', t('sim.title'));
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = t('sim.loading');
  const group = document.createElement('div');
  const speeds = [0, 1, 2, 4] as const;
  let failed = false;
  let displayedSpeed: SimSpeed | undefined;
  const buttons = speeds.map((speed) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t(speed === 0 ? 'sim.pause' : `sim.speed${speed}`);
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => void setSpeed(speed));
    group.append(button);
    return button;
  });
  panel.append(status, group);
  parent.append(panel);
  function showError() {
    failed = true;
    panel.dataset.ready = 'false';
    status.textContent = t('sim.failed');
    for (const button of buttons) button.disabled = true;
  }
  function update() {
    const clock = client.mirror.clock;
    if (!clock || failed) return;
    panel.dataset.ticks = String(clock.ticks);
    if (displayedSpeed === clock.speed) return;
    displayedSpeed = clock.speed;
    panel.dataset.ready = 'true';
    panel.dataset.speed = String(clock.speed);
    status.textContent = t(clock.speed === 0 ? 'sim.paused' : 'sim.running');
    buttons.forEach((button, i) => {
      button.disabled = false;
      button.setAttribute('aria-pressed', String(clock.speed === speeds[i]));
    });
  }
  async function setSpeed(speed: SimSpeed) {
    if (!client.mirror.clock || failed) return;
    try {
      const response = await client.send({ t: 'setSpeed', speed });
      if (response.t === 'result' && !response.ok) showError();
    } catch {
      showError();
    }
  }
  const unsubscribe = client.onEvent((event) => {
    if (event.t === 'error') showError();
    else if (event.t === 'clock' || event.t === 'ready') update();
  });
  update();
  return {
    setSpeed,
    showError,
    dispose() {
      unsubscribe();
      panel.remove();
    },
  };
}
