import {
  ACESFilmicToneMapping,
  FogExp2,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { MAP_SIZE, type QualityLevel } from '../data/config';
import { Terrain } from '../world/terrain';
import { TerrainRenderer } from './terrain/terrainRenderer';
import { CityPreview } from './cityPreview';
import { CITY_PREVIEW, MAP_PRESETS } from '../data/terrain';
import { WaterRenderer } from './water/waterRenderer';
import { RtsCamera } from './camera';
import { ENVIRONMENT_PALETTE } from '../data/palette';
import { CAMERA, LIGHTING, RENDER_PREVIEW } from '../data/rendering';
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
  onBeforeFrame?: (seconds: number) => void;
  onAfterCamera?: () => void;
  onStats?: (stats: Readonly<RenderStats>) => void;
  onContextState?: (lost: boolean) => void;
}
/** Own the WebGL scene, frame lifecycle, viewport and resource cleanup. */
export class CityRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(
    CAMERA.fovDegrees,
    1,
    RENDER_PREVIEW.nearM,
    RENDER_PREVIEW.farM,
  );
  readonly cameraController: RtsCamera;
  private lastFrame: number | null = null;
  private readonly focus = new Vector3();
  readonly terrain = new Terrain(MAP_PRESETS[0].seed);
  private readonly land = new TerrainRenderer(this.terrain);
  private readonly town = new CityPreview(this.terrain);
  private readonly water = new WaterRenderer(this.terrain);
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
    this.cameraController = new RtsCamera(this.camera, {
      bounds: {
        minX: -MAP_SIZE / 2,
        maxX: MAP_SIZE / 2,
        minZ: -MAP_SIZE / 2,
        maxZ: MAP_SIZE / 2,
      },
      heightAt: (x, z) => this.terrain.heightAt(x, z),
      initial: {
        ...CITY_PREVIEW.initial,
        distance:
          canvas.clientWidth / Math.max(1, canvas.clientHeight) < 0.7
            ? 2100
            : CITY_PREVIEW.initial.distance,
      },
    });
    this.cameraController.copyFocus(this.focus);
    this.scene.add(this.land.group, this.town.group, this.water.mesh, this.sky);
    this.canvas.dataset.buildings = String(this.town.buildingCount);
    this.canvas.dataset.chunks = String(this.land.group.children.length - 1);
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
    const lighting = new Lighting(this.scene, this.camera, level, [
      this.land.material,
      this.town.material,
      this.town.glass,
      this.water.material,
    ]);
    this.land.installShader(
      lighting.csm ? this.land.material.onBeforeCompile : undefined,
    );
    this.water.installShader(
      lighting.csm ? this.water.material.onBeforeCompile : undefined,
    );
    return lighting;
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
    this.cameraController.resize(width / height);
    this.stats.aspect = this.camera.aspect;
    this.lighting.resize();
  };
  private readonly visibility = (): void => {
    this.lastFrame = null;
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
    const seconds = this.lastFrame === null ? 0 : (now - this.lastFrame) / 1000;
    this.options.onBeforeFrame?.(seconds);
    this.cameraController.update(seconds);
    this.options.onAfterCamera?.();
    this.water.update(seconds);
    this.lastFrame = now;
    this.cameraController.copyFocus(this.focus);
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
    this.land.dispose();
    this.town.dispose();
    this.water.dispose();
    for (const mesh of [this.sky]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.scene.clear();
    this.renderer.dispose();
  }
}
