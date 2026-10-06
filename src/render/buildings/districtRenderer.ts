import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILDING_RENDER as R } from '../../data/buildingRendering';
import { BUILDING_FORM as F } from '../../data/buildingAppearance';
import { GROWTH } from '../../data/zones';
import {
  BUILDING_DETAIL_PALETTE as P,
  ENVIRONMENT_PALETTE as E,
  LIGHT_PALETTE as L,
  ROAD_PALETTE as ROAD,
} from '../../data/palette';
import type { Building } from '../../world/types';
import { BuildingRenderer } from './buildingRenderer';
import { districtFixture } from './districtFixture';

/** Small district and 5,000-building fixture run the exact same event consumer as the city. */
export class DistrictRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.5, 16000);
  private readonly buildings: BuildingRenderer;
  private readonly controls: OrbitControls;
  private readonly sun = new DirectionalLight(L.sun, 2.2);
  private readonly ambient = new HemisphereLight(L.sky, L.ground, 2);
  private readonly ground = new Mesh(
    new PlaneGeometry(7000, 7000),
    new MeshStandardMaterial({ color: E.grass, roughness: 1 }),
  );
  private readonly road = new Mesh(
    new PlaneGeometry(220, 10),
    new MeshStandardMaterial({ color: ROAD.asphalt, roughness: 1 }),
  );
  private readonly observer: ResizeObserver;
  private data: Building[] = [];
  private progress = 1;
  private playing = false;
  private last = 0;
  private reportAt = 0;
  private frames = 0;
  private fps = 0;
  private lost = false;
  private removed = false;
  private stopped = false;
  private eventAge = 0;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly report: (
      stats: ReturnType<DistrictRenderer['readStats']>,
    ) => void,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.scene.background = new Color(P.galleryDay);
    this.ground.rotation.x = this.road.rotation.x = -Math.PI / 2;
    this.road.position.y = 0.02;
    this.ground.receiveShadow = true;
    this.sun.position.set(-120, 240, 150);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -180,
      right: 180,
      top: 180,
      bottom: -180,
      near: 1,
      far: 700,
    });
    this.sun.shadow.bias = -0.0002;
    this.scene.add(
      this.ground,
      this.road,
      this.sun,
      this.sun.target,
      this.ambient,
    );
    this.buildings = new BuildingRenderer(this.scene, { heightAt: () => 0 });
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 35;
    this.controls.maxDistance = 9000;
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('webglcontextrestored', this.contextRestored);
    document.addEventListener('visibilitychange', this.visibility);
    this.load(4);
    this.resize();
    this.visibility();
  }
  load(count: number): void {
    this.playing = false;
    this.progress = 1;
    this.removed = false;
    this.data = districtFixture(count);
    this.buildings.reset(this.data);
    this.road.visible = count === 4;
    this.controls.target.set(0, count === 4 ? 16 : 0, count === 4 ? -24 : 0);
    const portrait =
      this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight) < 0.8;
    this.camera.position.set(
      count === 4 ? 90 : 2900,
      count === 4 ? 100 : 3300,
      count === 4 ? (portrait ? 360 : 150) : portrait ? 6800 : 3600,
    );
    if (count === 4) this.fitDistrict();
    this.controls.update();
    this.canvas.dataset.ready = 'false';
  }
  /** Fit all four buildings and crane booms to the actual canvas aspect, including tablets. */
  private fitDistrict(): void {
    const target = this.controls.target.set(10, 25, -22);
    const direction = new Vector3(0.4, 0.48, 0.78).normalize();
    this.camera.position.copy(target).addScaledVector(direction, 300);
    this.camera.lookAt(target);
    const inverse = this.camera.quaternion.clone().invert(),
      point = new Vector3();
    const aspect =
      this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const vertical = Math.tan((this.camera.fov * Math.PI) / 360);
    let distance = 0;
    for (const x of [-90, 120])
      for (const y of [0, 70])
        for (const z of [-44, 2]) {
          point.set(x, y, z).sub(target).applyQuaternion(inverse);
          distance = Math.max(
            distance,
            point.z +
              Math.max(
                Math.abs(point.x) / (vertical * aspect),
                Math.abs(point.y) / vertical,
              ),
          );
        }
    this.camera.position
      .copy(target)
      .addScaledVector(direction, distance * 1.12);
  }
  setProgress(value: number): void {
    this.playing = false;
    this.progress = value;
    if (this.removed) {
      this.buildings.reset(this.data);
      this.removed = false;
    }
    this.sendProgress();
  }
  private sendProgress(): void {
    this.buildings.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: this.data.map((b) => ({
        id: b.id,
        state: this.progress === 1 ? 'active' : 'construction',
        stateTimer: this.progress * GROWTH.constructionDays,
      })),
    });
  }
  play(): void {
    if (this.progress >= 1 || this.removed) this.setProgress(0);
    this.playing = !this.playing;
  }
  abandon(): void {
    this.playing = false;
    this.buildings.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: this.data.map((b) => ({ id: b.id, state: 'abandoned' })),
    });
  }
  demolish(): void {
    this.playing = false;
    this.removed = true;
    this.buildings.accept({
      t: 'buildingsChanged',
      added: [],
      updated: [],
      removed: this.data.map((b) => b.id),
    });
  }
  private readonly resize = (): void => {
    const w = Math.max(1, this.canvas.clientWidth),
      h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
  private readonly visibility = (): void => {
    this.last = this.reportAt = 0;
    this.frames = 0;
    this.renderer.setAnimationLoop(
      document.hidden || this.lost || this.stopped ? null : this.frame,
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
    this.renderer.info.autoReset = false;
    this.resize();
    this.visibility();
  };
  private readonly frame = (now: number): void => {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.controls.update();
    if (this.playing) {
      this.progress = Math.min(
        1,
        this.progress + dt / F.construction.previewSeconds,
      );
      this.eventAge += dt;
      if (this.eventAge >= R.progressBlendSeconds || this.progress === 1) {
        this.sendProgress();
        this.eventAge = 0;
      }
      if (this.progress === 1) this.playing = false;
    }
    this.buildings.update(dt, this.camera);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (!this.reportAt) this.reportAt = now;
    if (now - this.reportAt >= 250) {
      this.fps = (this.frames * 1000) / (now - this.reportAt);
      this.frames = 0;
      this.reportAt = now;
      const s = this.readStats();
      this.report(s);
      this.canvas.dataset.ready = String(s.pending === 0);
    }
  };
  readStats() {
    return {
      ...this.buildings.readStats(),
      progress: this.progress,
      playing: this.playing,
      fixtureCount: this.data.length,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      fps: this.fps,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      stages:
        this.data.length === 4
          ? this.data.map((b) => this.buildings.inspect(b.id))
          : [],
    };
  }
  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.visibility();
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.contextRestored,
    );
    this.controls.dispose();
    this.buildings.dispose();
    for (const m of [this.ground, this.road]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.sun.dispose();
    this.ambient.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }
}
