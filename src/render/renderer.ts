import {
  ACESFilmicToneMapping,
  BoxGeometry,
  FogExp2,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { type QualityLevel } from '../data/config';
import { BUILDING_PALETTE, ENVIRONMENT_PALETTE } from '../data/palette';
import { LIGHTING, RENDER_PREVIEW } from '../data/rendering';
import { Lighting } from './lighting';
import { createSky } from './sky';
import {
  detectQuality,
  qualityOverride,
  renderPixelRatio,
  StartupQuality,
} from './quality';

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
  quality: QualityLevel;
  dpr: number;
  aspect: number;
  shadows: number;
}
export interface RendererOptions {
  search?: string;
  onStats?: (stats: Readonly<RenderStats>) => void;
  onContextState?: (lost: boolean) => void;
}
/** Own the WebGL scene, frame lifecycle, viewport and resource cleanup. */
export class CityRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(
    RENDER_PREVIEW.fovDegrees,
    1,
    RENDER_PREVIEW.nearM,
    RENDER_PREVIEW.farM,
  );
  private readonly focus = new Vector3(...RENDER_PREVIEW.cameraTarget);
  private readonly ground = new Mesh(
    new PlaneGeometry(RENDER_PREVIEW.groundSizeM, RENDER_PREVIEW.groundSizeM),
    new MeshStandardMaterial({
      color: ENVIRONMENT_PALETTE.grass,
      roughness: 1,
    }),
  );
  private readonly box = new Mesh(
    new BoxGeometry(
      RENDER_PREVIEW.boxSizeM,
      RENDER_PREVIEW.boxSizeM,
      RENDER_PREVIEW.boxSizeM,
    ),
    new MeshStandardMaterial({
      color: BUILDING_PALETTE.RL.walls[0],
      roughness: 0.8,
    }),
  );
  private readonly sky = createSky();
  private lighting: Lighting;
  private readonly forced: QualityLevel | null;
  private readonly startup = new StartupQuality();
  private readonly observer: ResizeObserver;
  private readonly stats: RenderStats;
  private statsStart = 0;
  private statsFrames = 0;
  private disposed = false;
  private contextLost = false;

  /** Create the renderer in an existing canvas; throws if WebGL2 is unavailable. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: RendererOptions = {},
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Include shadow passes in draw-call/triangle counters.
    this.renderer.info.autoReset = false;
    const gl = this.renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = extension
      ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
      : '';
    this.forced = qualityOverride(options.search ?? location.search);
    const level =
      this.forced ??
      detectQuality({
        userAgent: navigator.userAgent,
        touchPoints: navigator.maxTouchPoints,
        screenWidth: screen.width,
        screenHeight: screen.height,
        gpu,
      });
    this.stats = {
      fps: 0,
      calls: 0,
      triangles: 0,
      quality: level,
      dpr: 1,
      aspect: 1,
      shadows: 0,
    };
    this.camera.position.set(...RENDER_PREVIEW.cameraPosition);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.box.position.y = RENDER_PREVIEW.boxSizeM / 2;
    this.box.castShadow = true;
    this.box.receiveShadow = true;
    this.scene.add(this.ground, this.box, this.sky);
    this.scene.fog = new FogExp2(
      ENVIRONMENT_PALETTE.sky_horizon,
      LIGHTING.fogDensity,
    );
    this.lighting = this.createLighting(level);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibility);
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
    this.resize();
    this.visibility();
  }
  private createLighting(level: QualityLevel): Lighting {
    this.renderer.shadowMap.enabled = level !== 'low';
    this.stats.shadows =
      level === 'high' ? LIGHTING.cascades : level === 'medium' ? 1 : 0;
    this.canvas.dataset.quality = level;
    return new Lighting(this.scene, this.camera, level, [
      this.ground.material,
      this.box.material,
    ]);
  }
  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth),
      height = Math.max(1, this.canvas.clientHeight);
    this.stats.dpr = renderPixelRatio(
      this.stats.quality,
      window.devicePixelRatio,
    );
    this.renderer.setPixelRatio(this.stats.dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.stats.aspect = this.camera.aspect;
    this.lighting.resize();
  };
  private readonly visibility = (): void => {
    this.statsStart = 0;
    this.statsFrames = 0;
    this.startup.reset();
    this.renderer.setAnimationLoop(
      document.hidden || this.contextLost || this.disposed ? null : this.frame,
    );
  };
  private readonly lost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.canvas.dataset.ready = 'false';
    this.visibility();
    this.options.onContextState?.(true);
  };
  private readonly restored = (): void => {
    this.contextLost = false;
    this.renderer.info.autoReset = false;
    this.resize();
    this.options.onContextState?.(false);
    this.visibility();
  };
  private readonly frame = (now: number): void => {
    if (
      this.stats.dpr !==
      renderPixelRatio(this.stats.quality, window.devicePixelRatio)
    )
      this.resize();
    if (
      this.startup.sample(now, this.forced !== null) === 'low' &&
      this.stats.quality !== 'low'
    ) {
      this.lighting.dispose();
      this.stats.quality = 'low';
      this.lighting = this.createLighting('low');
      this.resize();
    }
    this.sky.position.copy(this.camera.position);
    this.camera.updateMatrixWorld();
    this.lighting.update(this.focus);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    if (this.statsStart === 0) {
      this.statsStart = now;
      this.statsFrames = 0;
    } else this.statsFrames++;
    const elapsed = now - this.statsStart;
    if (elapsed >= RENDER_PREVIEW.debugIntervalMs) {
      this.stats.fps = (this.statsFrames * 1000) / elapsed;
      this.stats.calls = this.renderer.info.render.calls;
      this.stats.triangles = this.renderer.info.render.triangles;
      this.options.onStats?.(this.stats);
      this.statsStart = now;
      this.statsFrames = 0;
    }
    if (this.canvas.dataset.ready !== 'true')
      this.canvas.dataset.ready = 'true';
  };
  /** Stop animation and release event subscriptions, GPU resources and scene nodes. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.visibility);
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.lighting.dispose();
    for (const mesh of [this.ground, this.box, this.sky]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.scene.clear();
    this.renderer.dispose();
  }
}
