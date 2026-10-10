import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetLibrary } from './render/assets';
import { BUILDING_DETAIL_PALETTE as P, LIGHT_PALETTE } from './data/palette';
import { LIGHTING } from './data/rendering';
import { t } from './ui/i18n/t';
import './ui/styles/assetGallery.css';

/** Inspect a real compressed model in the game's lighting without changing a city save. */
export function startAssetGallery(root: HTMLElement): void {
  root.classList.add('asset-gallery');
  const header = document.createElement('header');
  const title = document.createElement('h1');
  title.textContent = t('asset.title');
  const help = document.createElement('p');
  help.textContent = t('asset.help');
  const back = document.createElement('a');
  back.href = import.meta.env.BASE_URL;
  back.textContent = t('menu.back');
  header.append(title, help, back);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', t('asset.canvas'));
  const footer = document.createElement('footer');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const reload = document.createElement('button');
  reload.textContent = t('asset.reload');
  const reset = document.createElement('button');
  reset.textContent = t('asset.reset');
  footer.append(status, reload, reset);
  root.append(header, canvas, footer);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true });
  } catch {
    status.textContent = t('render.unavailable');
    return;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new Scene();
  scene.background = new Color(P.galleryDay);
  const camera = new PerspectiveCamera(38, 1, 0.1, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 18;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.48;
  const resetCamera = () => {
    camera.position.set(23, 20, 26);
    controls.target.set(0, 3, -8);
    controls.update();
  };
  resetCamera();
  reset.onclick = resetCamera;
  const sun = new DirectionalLight(LIGHT_PALETTE.sun, LIGHTING.sunIntensity);
  sun.position.set(-30, 50, 35);
  scene.add(
    sun,
    new HemisphereLight(
      LIGHT_PALETTE.sky,
      LIGHT_PALETTE.ground,
      LIGHTING.hemisphereIntensity,
    ),
  );
  const library = new AssetLibrary(renderer);
  let model: Object3D | undefined;
  let disposed = false;
  const load = async () => {
    reload.disabled = true;
    canvas.dataset.ready = 'false';
    status.textContent = t('asset.loading');
    try {
      const replacement = await library.load('bld_rl_l2_2x2_sample');
      if (disposed) return;
      model?.removeFromParent();
      model = replacement;
      scene.add(model);
      let triangles = 0,
        textures = 0;
      model.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        triangles +=
          (node.geometry.index?.count ??
            node.geometry.getAttribute('position').count) / 3;
        for (const mat of Array.isArray(node.material)
          ? node.material
          : [node.material])
          if ('map' in mat && mat.map) textures++;
      });
      canvas.dataset.triangles = String(triangles);
      canvas.dataset.textures = String(textures);
      canvas.dataset.ready = 'true';
      status.textContent = t('asset.ready');
    } catch {
      if (!disposed) status.textContent = t('asset.failed');
    } finally {
      if (!disposed) reload.disabled = false;
    }
  };
  reload.onclick = () => {
    void load();
  };
  const resize = () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  const draw = () => {
    renderer.render(scene, camera);
  };
  const visibility = () =>
    renderer.setAnimationLoop(document.hidden ? null : draw);
  const lost = (event: Event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', visibility);
  document.addEventListener('visibilitychange', visibility);
  visibility();
  void load();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    controls.dispose();
    model?.removeFromParent();
    library.dispose();
    renderer.setAnimationLoop(null);
    renderer.dispose();
    document.removeEventListener('visibilitychange', visibility);
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', visibility);
  };
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  window.addEventListener('pagehide', dispose, { once: true });
}
