import type { PerspectiveCamera, Scene } from 'three';
import type { Terrain } from '../world/terrain';
import type { TerrainPick } from '../world/picking';
import { PickingMarker } from '../render/terrain/pickingMarker';
import { TerrainPicker } from './picking';

/** Debug input adapter: hover or a recognized single tap; camera gestures retain priority. */
export class PickingPreview {
  readonly picker: TerrainPicker;
  private readonly marker: PickingMarker;
  private readonly rect = { left: 0, top: 0, width: 0, height: 0 };
  private readonly observer: ResizeObserver;
  private x = 0;
  private y = 0;
  private active = false;
  private lastUi = -Infinity;
  private lastCell = -1;
  private lastRevision = -1;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    private readonly terrain: Terrain,
    private readonly scene: Scene,
    private readonly onPick: (hit: TerrainPick | null) => void,
  ) {
    this.picker = new TerrainPicker(terrain);
    this.marker = new PickingMarker(terrain);
    scene.add(this.marker.line);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener('pointermove', this.hover);
    canvas.addEventListener('pointerleave', this.leave);
    canvas.addEventListener('pointercancel', this.clear);
    canvas.addEventListener('webglcontextlost', this.clear);
    window.addEventListener('pointerdown', this.clear, true);
    window.addEventListener('keydown', this.key);
    window.addEventListener('blur', this.clear);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.clear);
  }
  private readonly resize = (): void => {
    const r = this.canvas.getBoundingClientRect();
    this.rect.left = r.left;
    this.rect.top = r.top;
    this.rect.width = r.width;
    this.rect.height = r.height;
  };
  private readonly hover = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || e.buttons) return;
    this.tap(e.clientX, e.clientY);
  };
  private readonly leave = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') this.clear();
  };
  private readonly key = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.clear();
  };
  /** Queue a gesture-validated single tap. Multi-touch and drags must not call this. */
  tap(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.active = true;
  }
  /** Clear the debug selection without committing a build or changing the world. */
  readonly clear = (): void => {
    this.active = false;
    this.lastCell = -1;
    this.marker.update(null);
    this.onPick(null);
  };
  /** Pick after camera.update and before drawing; all ray and mesh buffers are reused. */
  update(): void {
    if (!this.active) return;
    const hit = this.picker.pick(
      this.x,
      this.y,
      this.rect,
      this.camera,
      this.camera.far,
    );
    const cell = hit?.cell.index ?? -1;
    if (cell !== this.lastCell || this.lastRevision !== this.terrain.revision) {
      this.marker.update(hit);
      this.lastCell = cell;
      this.lastRevision = this.terrain.revision;
    }
    const now = performance.now();
    if (now - this.lastUi >= 200) {
      this.onPick(hit);
      this.lastUi = now;
    }
  }
  /** Remove pointer observers and release the optional debug renderer. */
  dispose(): void {
    this.clear();
    this.observer.disconnect();
    this.canvas.removeEventListener('pointermove', this.hover);
    this.canvas.removeEventListener('pointerleave', this.leave);
    this.canvas.removeEventListener('pointercancel', this.clear);
    this.canvas.removeEventListener('webglcontextlost', this.clear);
    window.removeEventListener('pointerdown', this.clear, true);
    window.removeEventListener('keydown', this.key);
    window.removeEventListener('blur', this.clear);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.clear);
    this.scene.remove(this.marker.line);
    this.marker.dispose();
  }
}
