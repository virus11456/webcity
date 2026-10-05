import { h, render } from 'preact';
import { CityRenderer } from './render/renderer';
import { createDebugPanel } from './ui/debug';
import { t } from './ui/i18n/t';
import { App } from './ui/App';
import { registerPwa } from './pwa/register';
import './ui/styles/tokens.css';
import './ui/styles/base.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) throw new Error('Missing #app element');

render(h(App, {}), root);

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
      onContextState(lost) {
        status.hidden = !lost;
        status.textContent = lost ? t('render.contextLost') : '';
      },
    });
  } catch {
    status.hidden = false;
    status.textContent = t('render.unavailable');
  }
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    city?.dispose();
    debug?.dispose();
  });
if (import.meta.env.PROD) void registerPwa();
