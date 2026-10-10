import {
  ACESFilmicToneMapping,
  Box3,
  Vector3,
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
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('asset.model'));
  footer.append(select, status, reload, reset);
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
    if (model) {
      const box = new Box3().setFromObject(model),
        center = box.getCenter(new Vector3()),
        size = box.getSize(new Vector3()).length();
      const vertical = (camera.fov * Math.PI) / 360,
        horizontal = Math.atan(Math.tan(vertical) * camera.aspect),
        distance = (size * 0.55) / Math.sin(Math.min(vertical, horizontal));
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(new Vector3(0.9, 0.7, 1).normalize().multiplyScalar(distance));
      camera.far = Math.max(200, size * 10);
      controls.maxDistance = Math.max(80, size * 5);
      camera.updateProjectionMatrix();
      controls.update();
      return;
    }
    camera.position.set(23, 20, 26);
    controls.target.set(0, 3, -8);
    controls.update();
  };
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
  let selected =
    new URLSearchParams(location.search).get('model') ?? 'bld_rl_l2_2x2_sample';
  resetCamera();
  const load = async () => {
    reload.disabled = select.disabled = true;
    canvas.dataset.ready = 'false';
    status.textContent = t('asset.loading');
    try {
      if (!select.options.length) {
        const entries = await library.list();
        for (const entry of entries) {
          const option = document.createElement('option');
          option.value = entry.id;
          option.textContent = entry.id;
          select.append(option);
        }
        select.value = selected;
      }
      const replacement = await library.load(selected);
      if (disposed) return;
      model?.removeFromParent();
      model = replacement;
      scene.add(model);
      model.traverse((node) => {
        if (/^LOD[12]$/.test(node.name)) node.visible = false;
      });
      resetCamera();
      let triangles = 0,
        textures = 0;
      model.traverse((node) => {
        if (!(node instanceof Mesh) || !node.visible) return;
        triangles +=
          (node.geometry.index?.count ??
            node.geometry.getAttribute('position').count) / 3;
        for (const mat of Array.isArray(node.material)
          ? node.material
          : [node.material])
          if ('map' in mat && mat.map) textures++;
      });
      canvas.dataset.model = selected;
      canvas.dataset.triangles = String(triangles);
      canvas.dataset.textures = String(textures);
      canvas.dataset.ready = 'true';
      status.textContent = t('asset.ready');
    } catch {
      if (!disposed) status.textContent = t('asset.failed');
    } finally {
      if (!disposed) reload.disabled = select.disabled = false;
    }
  };
  select.onchange = () => {
    selected = select.value;
    void load();
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
