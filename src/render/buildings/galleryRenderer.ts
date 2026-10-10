import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  BUILDING_FORM as F,
  type BuildingSpec,
} from '../../data/buildingAppearance';
import {
  BUILDING_DETAIL_PALETTE as P,
  LIGHT_PALETTE,
} from '../../data/palette';
import { createWindowAtlas } from './windowAtlas';
import { generateBuilding } from './generator';
import { ConstructionBuilding } from './construction';
interface Entry {
  building: ConstructionBuilding;
  scene: Scene;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  ambient: HemisphereLight;
  target: Vector3;
  radius: number;
  rect: { x: number; y: number; width: number; height: number };
  triangles: number;
}
/** One WebGL canvas and six scissor views; regenerate at most one building per frame. */
export class GalleryRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly atlas = createWindowAtlas();
  private readonly entries: Entry[] = [];
  private pending: BuildingSpec[] = [];
  private slots: HTMLElement[] = [];
  private readonly observer: ResizeObserver;
  private last = 0;
  private lost = false;
  private night = false;
  private angle = 0.65;
  private progress = 1;
  private shownPercent = -1;
  private playing = false;
  private readonly dayColor = new Color(P.galleryDay);
  private readonly nightColor = new Color(P.night);
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly report: (progress: number, playing: boolean) => void,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, F.gallery.maxDpr));
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    document.addEventListener('visibilitychange', this.visibility);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('webglcontextrestored', this.contextRestored);
    this.resize();
    this.visibility();
  }
  setSpecs(specs: BuildingSpec[], slots: HTMLElement[]): void {
    for (const e of this.entries) {
      e.building.dispose();
      e.sun.dispose();
      e.ambient.dispose();
      e.scene.clear();
    }
    this.entries.length = 0;
    this.pending = specs.slice();
    this.slots = slots;
    this.canvas.dataset.ready = 'false';
    this.canvas.dataset.count = String(specs.length);
    this.resize();
  }
  private create(spec: BuildingSpec): void {
    const geometry = generateBuilding(
        spec.zone,
        spec.level,
        spec.w,
        spec.d,
        spec.seed,
      ),
      building = new ConstructionBuilding(geometry, this.atlas),
      scene = new Scene();
    const height = building.height,
      target = new Vector3(0, height * 0.48, -spec.d * 4),
      radius = Math.sqrt(
        (spec.w * 4 + 2) ** 2 +
          (spec.d * 4 + 2) ** 2 +
          (height * 0.55 + 3) ** 2,
      );
    const camera = new PerspectiveCamera(38, 1, 0.1, 2000),
      sun = new DirectionalLight(LIGHT_PALETTE.sun, 3),
      ambient = new HemisphereLight(
        LIGHT_PALETTE.sky,
        LIGHT_PALETTE.ground,
        1.5,
      );
    sun.position.set(-50, 100, 80);
    scene.add(building.group, sun, ambient);
    building.setProgress(this.progress);
    building.setNight(this.night);
    const entry = {
      building,
      scene,
      camera,
      sun,
      ambient,
      target,
      radius,
      rect: { x: 0, y: 0, width: 1, height: 1 },
      triangles: geometry.getAttribute('position').count / 3,
    };
    this.entries.push(entry);
    this.applyLight(entry);
    this.resize();
  }
  setProgress(value: number): void {
    this.progress = Math.max(0, Math.min(1, value));
    for (const e of this.entries) e.building.setProgress(this.progress);
    this.report(this.progress, this.playing);
  }
  setPlaying(value: boolean): void {
    this.playing = value;
    if (value && this.progress === 1) this.setProgress(0);
    this.last = 0;
    this.report(this.progress, this.playing);
  }
  rotate(delta: number): void {
    this.angle += delta;
    this.pose();
  }
  setNight(value: boolean): void {
    this.night = value;
    for (const e of this.entries) this.applyLight(e);
  }
  private applyLight(e: Entry): void {
    e.scene.background = this.night ? this.nightColor : this.dayColor;
    e.sun.intensity = this.night ? 0.35 : 3;
    e.ambient.intensity = this.night ? 0.3 : 1.5;
    e.building.setNight(this.night);
  }
  private pose(): void {
    for (const e of this.entries) {
      const distance =
        (e.radius * F.gallery.fitPadding) /
        Math.sin(
          Math.min(
            (e.camera.fov * Math.PI) / 360,
            Math.atan(
              Math.tan((e.camera.fov * Math.PI) / 360) * e.camera.aspect,
            ),
          ),
        );
      e.camera.position.set(
        e.target.x + Math.sin(this.angle) * distance * 0.82,
        e.target.y + distance * 0.57,
        e.target.z + Math.cos(this.angle) * distance * 0.82,
      );
      e.camera.lookAt(e.target);
      e.camera.updateMatrixWorld();
    }
  }
  private readonly resize = (): void => {
    const b = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, b.width), Math.max(1, b.height), false);
    for (const [i, e] of this.entries.entries()) {
      const r = this.slots[i]!.getBoundingClientRect();
      Object.assign(e.rect, {
        x: r.x - b.x,
        y: b.height - (r.bottom - b.y),
        width: r.width,
        height: Math.max(1, r.height - 38),
      });
      e.camera.aspect = e.rect.width / e.rect.height;
      e.camera.updateProjectionMatrix();
    }
    this.pose();
  };
  private readonly frame = (now: number): void => {
    const seconds = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    const next = this.pending.shift();
    if (next) this.create(next);
    if (this.playing && !this.pending.length) {
      this.setProgress(this.progress + seconds / F.construction.previewSeconds);
      if (this.progress >= 1) this.setPlaying(false);
    }
    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(this.night ? this.nightColor : this.dayColor);
    this.renderer.clear();
    this.renderer.setScissorTest(true);
    for (const e of this.entries) {
      e.building.update(seconds);
      const r = e.rect;
      this.renderer.setViewport(r.x, r.y, r.width, r.height);
      this.renderer.setScissor(r.x, r.y, r.width, r.height);
      this.renderer.render(e.scene, e.camera);
    }
    if (!this.pending.length && this.canvas.dataset.ready !== 'true')
      this.canvas.dataset.ready = 'true';
    const percent = Math.round(this.progress * 100);
    if (percent !== this.shownPercent) {
      this.shownPercent = percent;
      this.canvas.dataset.progress = String(percent);
    }
  };
  private readonly visibility = (): void => {
    this.last = 0;
    this.renderer.setAnimationLoop(
      document.hidden || this.lost ? null : this.frame,
    );
  };
  private readonly contextLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
    this.canvas.dataset.ready = 'false';
    this.visibility();
  };
  private readonly contextRestored = (): void => {
    this.lost = false;
    this.resize();
    this.visibility();
  };
  readStats() {
    return {
      count: this.entries.length,
      pending: this.pending.length,
      triangles: this.entries.map((e) => e.triangles),
      stages: this.entries.map((e) => e.building.readState()),
      progress: this.progress,
      playing: this.playing,
      night: this.night,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.contextRestored,
    );
    for (const e of this.entries) {
      e.building.dispose();
      e.sun.dispose();
      e.ambient.dispose();
    }
    this.atlas.dispose();
    this.renderer.dispose();
  }
}
