import { createMilestoneControls } from './milestoneControls';
import { h, render } from 'preact';
import type { SimClient } from '../bridge/simClient';
import { TopBar } from './hud/TopBar';
import { createTopBarModel } from './hud/topBarModel';

/** Mount the worker-fed HUD and retain the shared keyboard speed API. */
export function createSimControls(parent: HTMLElement, client: SimClient) {
  const host = document.createElement('div');
  host.className = 'topbar-host';
  parent.append(host);
  const model = createTopBarModel(client);
  const milestones = createMilestoneControls(parent, client);
  render(h(TopBar, { model }), host);
  const bar = host.querySelector<HTMLElement>('.topbar')!;
  const updateInset = () =>
    parent.style.setProperty(
      '--topbar-bottom',
      `${bar.offsetTop + bar.offsetHeight + 10}px`,
    );
  const resize = new ResizeObserver(updateInset);
  resize.observe(bar);
  updateInset();
  return {
    setSpeed: model.setSpeed,
    showError: model.showError,
    dispose() {
      resize.disconnect();
      parent.style.removeProperty('--topbar-bottom');
      model.dispose();
      milestones.dispose();
      render(null, host);
      host.remove();
    },
  };
}
