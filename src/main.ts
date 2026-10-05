import { PickingPreview } from './input/pickingPreview';
import { createPickingDebug } from './ui/pickingDebug';
import type { TerrainPick } from './world/picking';
import { CITY_PREVIEW, MAP_PRESETS, type CityView } from './data/terrain';
import { SimClient } from './bridge/simClient';
import { createSimControls } from './ui/simControls';
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
    __webcityPick?: (x: number, y: number) => TerrainPick | null;
  }
}

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) throw new Error('Missing #app element');

let input: CameraController | undefined;
let city: CityRenderer | undefined;
let picking: PickingPreview | undefined;
let pickingDebug: ReturnType<typeof createPickingDebug> | undefined;
render(
  h(App, {
    onViewChange: (view: CityView) => {
      const target = CITY_PREVIEW.views[view];
      city?.cameraController.flyTo(target, target.distance);
    },
    onEdgeScrollChange: (enabled: boolean) => input?.setEdgeScrolling(enabled),
  }),
  root,
);

const canvas = root.querySelector<HTMLCanvasElement>('canvas');
const status = root.querySelector<HTMLParagraphElement>('.render-status');
const debug =
  new URLSearchParams(location.search).get('debug') === '1'
    ? createDebugPanel(root)
    : undefined;
let sim: SimClient | undefined;
let simControls: ReturnType<typeof createSimControls> | undefined;
try {
  sim = new SimClient(
    new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' }),
  );
  simControls = createSimControls(root, sim);
  void sim
    .send({
      t: 'init',
      seed: MAP_PRESETS[0].seed,
      mapId: MAP_PRESETS[0].id,
      mode: 'normal',
      cityName: t('city.name'),
    })
    .then((response) => {
      if (response.t !== 'ready') simControls?.showError();
    })
    .catch(() => simControls?.showError());
} catch {
  if (status) {
    status.hidden = false;
    status.textContent = t('sim.failed');
  }
}
if (canvas && status) {
  try {
    city = new CityRenderer(canvas, {
      onStats: debug?.update,
      onBeforeFrame: (seconds) => input?.update(seconds),
      onAfterCamera: () => picking?.update(),
      onContextState(lost) {
        status.hidden = !lost;
        status.textContent = lost ? t('render.contextLost') : '';
      },
    });
    if (debug) {
      pickingDebug = createPickingDebug(root);
      picking = new PickingPreview(
        canvas,
        city.camera,
        city.terrain,
        city.scene,
        pickingDebug.update,
      );
      window.__webcityPick = (x, y) =>
        picking!.picker.pick(
          x,
          y,
          canvas.getBoundingClientRect(),
          city!.camera,
          city!.camera.far,
        );
    }
    input = new CameraController(canvas, city.cameraController, {
      onTap: (p) => picking?.tap(p.x, p.y),
      onShortcut: (action) => {
        const speed = sim?.mirror.clock?.speed;
        if (action === 'pause') void simControls?.setSpeed(speed === 0 ? 1 : 0);
        else if (action === 'speed1') void simControls?.setSpeed(1);
        else if (action === 'speed2') void simControls?.setSpeed(2);
        else if (action === 'speed3') void simControls?.setSpeed(4);
      },
    });
    if (debug) window.__webcityCamera = city.cameraController;
  } catch {
    status.hidden = false;
    status.textContent = t('render.unavailable');
  }
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    delete window.__webcityCamera;
    delete window.__webcityPick;
    picking?.dispose();
    pickingDebug?.dispose();
    input?.dispose();
    city?.dispose();
    debug?.dispose();
    simControls?.dispose();
    sim?.dispose();
  });
if (import.meta.env.PROD) void registerPwa();
