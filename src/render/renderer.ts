import { resolveMap } from '../world/mapSelection';
import { Weather } from './weather';
import { WEATHER } from '../data/weather';
import {
  GRAPHICS_DEFAULTS,
  QUALITY,
  type GraphicsOptions,
} from '../data/config';
import { VegetationRenderer } from './vegetation/vegetation';
import type { SimEvent } from '../bridge/protocol';
import { PostProcessing } from './postfx/pipeline';
import { DayNight } from './dayNight';
import { installNightWindows } from './nightWindows';
import { BUILDING_DETAIL_PALETTE } from '../data/palette';
import { DAY_NIGHT } from '../data/dayNight';
import type { SimClock } from '../world/snapshot';
import { WATER_UTILITY } from '../data/waterUtility';
import {
  ACESFilmicToneMapping,
  FogExp2,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import type { ShaderHook } from './buildings/buildingMaterial';
import { MAP_SIZE, type QualityLevel } from '../data/config';
import { TimingWindow, type TimingSummary } from '../core/timingWindow';
import { PERFORMANCE } from '../data/performance';
import { Terrain } from '../world/terrain';
import { TerrainRenderer } from './terrain/terrainRenderer';
import { CityPreview } from './cityPreview';
import { CITY_PREVIEW, MAP_PRESETS } from '../data/terrain';
import { WaterRenderer } from './water/waterRenderer';
import { RtsCamera } from './camera';
import { ENVIRONMENT_PALETTE } from '../data/palette';
import { CAMERA, LIGHTING, RENDER_PREVIEW } from '../data/rendering';
import { Lighting } from './lighting';
import { createSky, fogDensityAtHeight } from './sky';
import {
  detectQuality,
  qualityOverride,
  renderPixelRatio,
  StartupQuality,
  SustainedQuality,
} from './quality';

export interface RenderStats {
  frame?: TimingSummary;
  fps: number;
  calls: number;
  triangles: number;
  quality: QualityLevel;
  dpr: number;
  aspect: number;
  shadows: number;
  fogDensity: number;
  hour: number;
  postfx: number;
  tilt: number;
}
export interface RendererOptions {
  seed?: number;
  mapId?: string;
  search?: string;
  onBeforeFrame?: (seconds: number) => void;
  onAfterCamera?: () => void;
  onStats?: (stats: Readonly<RenderStats>) => void;
  onAutoQuality?: (level: 'low' | 'medium') => void;
  onContextState?: (lost: boolean) => void;
}
/** Own the WebGL scene, frame lifecycle, viewport and resource cleanup. */
export class CityRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly dayNight = new DayNight();
  readonly weather: Weather;
  readonly camera = new PerspectiveCamera(
    CAMERA.fovDegrees,
    1,
    RENDER_PREVIEW.nearM,
    RENDER_PREVIEW.farM,
  );
  readonly cameraController: RtsCamera;
  private lastFrame: number | null = null;
  private readonly focus = new Vector3();
  private readonly extraMaterials = new Map<
    Material,
    ((previous?: ShaderHook) => void) | undefined
  >();
  readonly terrain: Terrain;
  readonly vegetation: VegetationRenderer;
  private readonly land: TerrainRenderer;
  private readonly town: CityPreview;
  private readonly water: WaterRenderer;
  private readonly sky = createSky();
  private lighting: Lighting;
  private postfx: PostProcessing | null = null;
  private forced: QualityLevel | null;
  private readonly automaticQuality: QualityLevel;
  private readonly startup = new StartupQuality();
  private readonly sustained = new SustainedQuality();
  private graphics: GraphicsOptions = { ...GRAPHICS_DEFAULTS };
  private readonly observer: ResizeObserver;
  private readonly stats: RenderStats;
  private statsStart = 0;
  private statsFrames = 0;
  private disposed = false;
  private contextLost = false;
  private readonly frameTiming: TimingWindow | undefined;

  /** Create the renderer in an existing canvas; throws if WebGL2 is unavailable. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: RendererOptions = {},
  ) {
    this.frameTiming = options.onStats
      ? new TimingWindow(PERFORMANCE.samples)
      : undefined;
    this.terrain = new Terrain(
      options.seed ?? MAP_PRESETS[0].seed,
      resolveMap(
        options.mapId ?? MAP_PRESETS[0].id,
        options.seed ?? MAP_PRESETS[0].seed,
      ) ?? MAP_PRESETS[0],
    );
    this.weather = new Weather(this.terrain.seed);
    this.scene.add(this.weather.rain);
    this.land = new TerrainRenderer(this.terrain);
    this.vegetation = new VegetationRenderer(this.terrain);
    this.vegetation.group.visible = false;
    this.town = new CityPreview(this.terrain);
    this.water = new WaterRenderer(this.terrain);
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING.exposure;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    // Include shadow passes in draw-call/triangle counters.
    this.renderer.info.autoReset = false;
    const gl = this.renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = extension
      ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
      : '';
    this.forced = qualityOverride(options.search ?? location.search);
    this.automaticQuality = detectQuality({
      userAgent: navigator.userAgent,
      touchPoints: navigator.maxTouchPoints,
      screenWidth: screen.width,
      screenHeight: screen.height,
      gpu,
    });
    const level = this.forced ?? this.automaticQuality;
    this.stats = {
      fps: 0,
      calls: 0,
      triangles: 0,
      quality: level,
      dpr: 1,
      aspect: 1,
      shadows: 0,
      fogDensity: LIGHTING.fogDensity,
      hour: 12,
      postfx: 0,
      tilt: 0,
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
    this.scene.add(
      this.land.group,
      this.town.group,
      this.water.mesh,
      this.sky,
      this.vegetation.group,
    );
    this.canvas.dataset.buildings = String(this.town.buildingCount);
    this.canvas.dataset.chunks = String(this.land.group.children.length - 1);
    this.scene.fog = new FogExp2(
      ENVIRONMENT_PALETTE.sky_horizon,
      LIGHTING.fogDensity,
    );
    this.lighting = this.createLighting(level);
    this.createPostfx(level);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibility);
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
    this.resize();
    this.visibility();
  }
  /** Capture after an explicit render so non-preserved WebGL buffers still produce a thumbnail. */
  thumbnail(width: number, height: number, quality: number): string {
    if (this.postfx) this.postfx.render();
    else this.renderer.render(this.scene, this.camera);
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    output.getContext('2d')!.drawImage(this.canvas, 0, 0, width, height);
    return output.toDataURL('image/jpeg', quality);
  }
  /** Separate decorative city assets from the authoritative construction world. */
  setConstructionMode(enabled: boolean): void {
    this.town.group.visible = !enabled;
    this.vegetation.group.visible = enabled;
    this.canvas.dataset.construction = String(enabled);
  }
  /** Read-only diagnostics for edited terrain and water texture uploads. */
  readTerrain(x: number, z: number) {
    return {
      height: this.terrain.heightAt(x, z),
      revision: this.terrain.revision,
      waterVersion: this.water.heightTexture.version,
    };
  }
  /** Copy worker-owned heights into rendering/picking terrain and refresh changed terrain chunks. */
  syncTerrain(heights: Float32Array): void {
    let changed = false;
    for (let i = 0; i < heights.length; i++)
      if (this.terrain.heights[i] !== heights[i]) {
        this.terrain.heights[i] = heights[i]!;
        changed = true;
      }
    if (changed) {
      this.terrain.revision++;
      this.land.sync();
      this.vegetation.terrainChanged();
    }
  }
  /** Register late-created world materials with current and future shadow quality tiers. */
  registerMaterial(
    material: Material,
    install?: (previous?: ShaderHook) => void,
  ): void {
    this.extraMaterials.set(material, install);
    this.lighting.csm?.setupMaterial(material);
    install?.(this.lighting.csm ? material.onBeforeCompile : undefined);
  }
  unregisterMaterial(material: Material): void {
    this.extraMaterials.delete(material);
    this.lighting.csm?.shaders.delete(material);
  }
  get quality(): QualityLevel {
    return this.stats.quality;
  }
  /** Apply saved quality without reloading or losing the current city. */
  setQuality(value: QualityLevel | 'auto'): void {
    const requested = value === 'auto' ? null : value;
    if (this.forced === requested) return;
    this.forced = requested;
    const level = this.forced ?? this.automaticQuality;
    this.startup.reset(true);
    this.sustained.reset();
    if (level === this.stats.quality) return;
    this.lighting.dispose();
    this.stats.quality = level;
    this.lighting = this.createLighting(level);
    this.createPostfx(level);
    this.resize();
  }
  setGraphics(value: GraphicsOptions): void {
    const lighting = this.graphics.shadows !== value.shadows;
    const postfx = this.graphics.postprocessing !== value.postprocessing;
    this.graphics = {
      shadows: value.shadows,
      postprocessing: value.postprocessing,
      tiltShift: value.tiltShift,
      treeDensity: value.treeDensity,
    };
    if (lighting) {
      this.lighting.dispose();
      this.lighting = this.createLighting(this.stats.quality);
    }
    if (postfx) {
      this.createPostfx(this.stats.quality);
      this.resize();
    }
    this.vegetation.setDensity(
      (QUALITY[this.stats.quality].treeDensity * this.graphics.treeDensity) /
        100,
    );
  }
  readGraphics() {
    return {
      ...this.graphics,
      quality: this.stats.quality,
      shadowsActive: this.stats.shadows,
      postfxActive: this.stats.postfx,
      tilt: this.stats.tilt,
      density:
        (QUALITY[this.stats.quality].treeDensity * this.graphics.treeDensity) /
        100,
    };
  }
  private createPostfx(level: QualityLevel): void {
    this.postfx?.dispose();
    this.postfx =
      level === 'low' || !this.graphics.postprocessing
        ? null
        : new PostProcessing(this.renderer, this.scene, this.camera, level);
  }
  private createLighting(level: QualityLevel): Lighting {
    this.vegetation.setDensity(
      (QUALITY[level].treeDensity * this.graphics.treeDensity) / 100,
    );
    const shadowLevel = this.graphics.shadows ? level : 'low';
    this.renderer.shadowMap.enabled = shadowLevel !== 'low';
    this.stats.shadows =
      shadowLevel === 'high'
        ? LIGHTING.cascades
        : shadowLevel === 'medium'
          ? 1
          : 0;
    this.canvas.dataset.quality = level;
    this.town.glass.emissive.set(BUILDING_DETAIL_PALETTE.windowLight);
    this.town.glass.emissiveIntensity = DAY_NIGHT.windowIntensity;
    const lighting = new Lighting(this.scene, this.camera, shadowLevel, [
      this.land.material,
      this.town.material,
      this.town.glass,
      this.town.lamps,
      this.water.material,
      this.vegetation.material,
      this.vegetation.billboard.material,
      ...this.extraMaterials.keys(),
    ]);
    installNightWindows(
      this.town.glass,
      this.dayNight.hour,
      lighting.csm ? this.town.glass.onBeforeCompile : undefined,
    );
    this.vegetation.installBillboard(
      lighting.csm
        ? this.vegetation.billboard.material.onBeforeCompile
        : undefined,
    );
    this.land.material.userData.infoRole = 'field';
    this.water.material.userData.infoRole = 'field';
    this.land.installShader(
      lighting.csm ? this.land.material.onBeforeCompile : undefined,
    );
    this.weather.installShadow(this.land.material);
    this.weather.setQuality(level);
    this.water.installShader(
      lighting.csm ? this.water.material.onBeforeCompile : undefined,
    );
    for (const [material, install] of this.extraMaterials)
      install?.(lighting.csm ? material.onBeforeCompile : undefined);
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
    this.postfx?.resize(width, height, this.stats.dpr);
  };
  private readonly visibility = (): void => {
    this.lastFrame = null;
    this.statsStart = 0;
    this.statsFrames = 0;
    this.startup.reset();
    this.sustained.reset();
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
    const started = this.frameTiming ? performance.now() : 0;
    if (
      this.stats.dpr !==
      renderPixelRatio(this.stats.quality, window.devicePixelRatio)
    )
      this.resize();
    const automatic = this.forced === null;
    const downgrade =
      this.startup.sample(now, !automatic) ??
      this.sustained.sample(now, !automatic, this.stats.quality);
    if (downgrade && this.stats.quality !== downgrade) {
      this.lighting.dispose();
      this.stats.quality = downgrade;
      this.lighting = this.createLighting(downgrade);
      this.createPostfx(downgrade);
      this.resize();
      this.sustained.reset();
      this.options.onAutoQuality?.(downgrade);
    }
    const seconds = this.lastFrame === null ? 0 : (now - this.lastFrame) / 1000;
    this.dayNight.update(seconds);
    this.weather.update(seconds, this.camera);
    this.dayNight.sunIntensity *=
      1 - this.weather.sample.cloud * WEATHER.sunDim;
    this.dayNight.ambientIntensity *=
      1 - this.weather.sample.cloud * WEATHER.ambientDim;
    this.stats.hour = this.dayNight.hour.value;
    this.lighting.setEnvironment(this.dayNight);
    this.town.setNight(this.dayNight.night);
    this.sky.material.uniforms.zenith!.value.copy(this.dayNight.zenith);
    this.sky.material.uniforms.horizon!.value.copy(this.dayNight.horizon);
    this.sky.material.uniforms.sunColor!.value.copy(this.dayNight.sun);
    (this.scene.fog as FogExp2).color.copy(this.dayNight.horizon);
    this.water.setSkyColor(this.dayNight.horizon);
    this.options.onBeforeFrame?.(seconds);
    this.cameraController.update(seconds);
    this.options.onAfterCamera?.();
    this.water.update(seconds);
    this.vegetation.update(this.camera);
    this.lastFrame = now;
    this.cameraController.copyFocus(this.focus);
    this.sky.position.copy(this.camera.position);
    this.stats.fogDensity =
      fogDensityAtHeight(this.camera.position.y) +
      this.weather.sample.fog * WEATHER.maxFogDensity;
    (this.scene.fog as FogExp2).density = this.stats.fogDensity;
    this.camera.updateMatrixWorld();
    this.lighting.update(this.focus);
    this.postfx?.update(
      Math.max(0, this.camera.position.y - this.focus.y),
      this.dayNight.night,
      this.graphics.tiltShift,
    );
    this.stats.postfx = this.postfx?.flags ?? 0;
    this.stats.tilt = this.postfx?.tilt ?? 0;
    this.renderer.info.reset();
    if (this.postfx) this.postfx.render();
    else this.renderer.render(this.scene, this.camera);
    this.frameTiming?.record(performance.now() - started);
    if (this.statsStart === 0) {
      this.statsStart = now;
      this.statsFrames = 0;
    } else this.statsFrames++;
    const elapsed = now - this.statsStart;
    if (elapsed >= RENDER_PREVIEW.debugIntervalMs) {
      this.stats.fps = (this.statsFrames * 1000) / elapsed;
      this.stats.calls = this.renderer.info.render.calls;
      this.stats.triangles = this.renderer.info.render.triangles;
      this.stats.frame = this.frameTiming?.read();
      this.options.onStats?.(this.stats);
      this.statsStart = now;
      this.statsFrames = 0;
    }
    if (this.canvas.dataset.ready !== 'true')
      this.canvas.dataset.ready = 'true';
  };
  setDayNight(enabled: boolean): void {
    this.dayNight.enabled = enabled;
  }
  acceptClock(clock: Readonly<SimClock>): void {
    this.dayNight.accept(clock);
    this.weather.accept(clock);
  }
  /** Forward water-only authoritative data to the visual surface. */
  acceptWater(event: SimEvent): void {
    this.water.accept(event);
  }
  /** Underground utility view leaves the terrain pick surface intact. */
  setWaterOverlay(enabled: boolean): void {
    const material = this.land.material;
    if (material.transparent !== enabled) {
      material.transparent = enabled;
      material.needsUpdate = true;
    }
    material.opacity = enabled ? WATER_UTILITY.terrainOpacity : 1;
    material.depthWrite = !enabled;
  }
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
    this.postfx?.dispose();
    this.land.dispose();
    this.vegetation.dispose();
    this.weather.dispose();
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
