import { CameraController } from './input/cameraController';
import type { RtsCamera } from './render/camera';
import { h, render } from 'preact';
import { CityRenderer } from './render/renderer';
import { createDebugPanel } from './ui/debug';
import { t } from './ui/i18n/t';
import { App } from './ui/App';
import { registerPwa } from './pwa/register';
import './ui/styles/tokens.css';
import './ui/styles/base.css';

declare global {
  interface Window {
    __webcityCamera?: RtsCamera;
  }
}

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) throw new Error('Missing #app element');

let input: CameraController | undefined;
render(
  h(App, {
    onEdgeScrollChange: (enabled: boolean) => input?.setEdgeScrolling(enabled),
  }),
  root,
);

const canvas = root.querySelector<HTMLCanvasElement>('canvas');
const status = root.querySelector<HTMLParagraphElement>('.render-status');
let city: CityRenderer | undefined;
const debug =
  new URLSearchParams(location.search).get('debug') === '1'
    ? createDebugPanel(root)
    : undefined;
if (canvas && status) {
  try {
    city = new CityRenderer(canvas, {
      onStats: debug?.update,
      onBeforeFrame: (seconds) => input?.update(seconds),
      onContextState(lost) {
        status.hidden = !lost;
        status.textContent = lost ? t('render.contextLost') : '';
      },
    });
    input = new CameraController(canvas, city.cameraController);
    if (debug) window.__webcityCamera = city.cameraController;
  } catch {
    status.hidden = false;
    status.textContent = t('render.unavailable');
  }
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    delete window.__webcityCamera;
    input?.dispose();
    city?.dispose();
    debug?.dispose();
  });
if (import.meta.env.PROD) void registerPwa();
