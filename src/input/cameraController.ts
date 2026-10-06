import { INPUT } from '../data/input';
import type { RtsCamera } from '../render/camera';
import { Gestures, type InputPointer, type Point } from './gestures';
import { KeyboardInput, type Shortcut } from './keyboard';
import { PointerInput } from './pointer';

/** Structural adapter for future tools; input never imports the tools or UI layers. */
export interface InputTool {
  onPointerDown(p: InputPointer): void;
  onPointerMove(p: InputPointer): void;
  onPointerUp(p: InputPointer): void;
  onCancel(): void;
  onAngleModifier?(disabled: boolean): void;
}
export interface InputOptions {
  onTap?: (p: InputPointer) => void;
  onLongPress?: (p: InputPointer) => void;
  onShortcut?: (action: Shortcut) => void;
}
/** Translate pointer and keyboard intent into camera operations in the render loop. */
export class CameraController {
  private readonly gestures: Gestures;
  private readonly pointer: PointerInput;
  private readonly keyboard: KeyboardInput;
  private readonly state;
  private readonly anchor = { x: 0, y: 0 };
  private tool: InputTool | null = null;
  private toolActive = false;
  private edgeEnabled = false;
  private edgeX = 0;
  private edgeY = 0;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: RtsCamera,
    options: InputOptions = {},
  ) {
    this.state = camera.readState();
    this.gestures = new Gestures({
      start: (p) => {
        this.stopEdge();
        if (p.button === 2) this.tool?.onCancel();
        if (p.button === 0 && this.tool) {
          this.toolActive = true;
          this.tool.onPointerDown(p);
        }
      },
      drag: (p, dx, dy) => {
        if (p.button === 2) {
          if (p.ctrl) camera.tilt(dy * INPUT.tiltPerPixel);
          else camera.rotate(-dx * INPUT.rotatePerPixel);
        } else if (p.button === 0 && this.tool) {
          if (this.toolActive) this.tool.onPointerMove(p);
        } else this.panPixels(-dx, -dy);
      },
      end: (p) => {
        if (this.toolActive) this.tool?.onPointerUp(p);
        this.toolActive = false;
      },
      tap: (p) => {
        if (p.button === 0 && !this.tool) options.onTap?.(p);
      },
      longPress: (p) => options.onLongPress?.(p),
      cancel: () => {
        if (this.toolActive) this.tool?.onCancel();
        this.toolActive = false;
      },
      pair: (dx, dy, scale, angle, center, tilt) => {
        if (tilt) camera.tilt(dy * INPUT.tiltPerPixel);
        else {
          if (dx || dy) this.panPixels(-dx, -dy);
          if (angle) camera.rotate(-angle);
          if (scale !== 1) camera.zoom(scale, this.ndc(center));
        }
      },
    });
    this.pointer = new PointerInput(canvas, this.gestures);
    this.keyboard = new KeyboardInput(canvas, (action) => {
      if (action === 'cancel') {
        this.pointer.cancel();
        this.tool?.onCancel();
      }
      options.onShortcut?.(action);
    });
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('pointermove', this.edge);
    canvas.addEventListener('pointermove', this.hover);
    window.addEventListener('keydown', this.modifier);
    window.addEventListener('keyup', this.modifier);
    canvas.addEventListener('pointerleave', this.stopEdge);
    canvas.addEventListener('blur', this.stopEdge);
    canvas.addEventListener('webglcontextlost', this.reset);
    window.addEventListener('blur', this.reset);
    document.addEventListener('visibilitychange', this.reset);
  }
  private ndc(p: Point): Point {
    const rect = this.canvas.getBoundingClientRect();
    this.anchor.x = ((p.x - rect.left) / rect.width) * 2 - 1;
    this.anchor.y = 1 - ((p.y - rect.top) / rect.height) * 2;
    return this.anchor;
  }
  private panPixels(dx: number, dy: number): void {
    this.camera.copyState(this.state);
    const scale =
      (2 *
        this.state.distance *
        Math.tan((this.camera.camera.fov * Math.PI) / 360)) /
      Math.max(1, this.canvas.clientHeight);
    this.panAxes(dx * scale, (dy * scale) / Math.sin(this.state.elevation));
  }
  private panAxes(right: number, down: number): void {
    this.camera.copyState(this.state);
    const s = Math.sin(this.state.azimuth),
      c = Math.cos(this.state.azimuth);
    this.camera.pan(c * right + s * down, -s * right + c * down);
  }
  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const unit =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? INPUT.wheelLinePx
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? this.canvas.clientHeight
          : 1;
    const pixels = Math.max(
      -INPUT.wheelMaxPx,
      Math.min(INPUT.wheelMaxPx, e.deltaY * unit),
    );
    this.camera.zoom(
      Math.exp(pixels * INPUT.wheelScale),
      this.ndc({ x: e.clientX, y: e.clientY }),
    );
  };
  private readonly edge = (e: PointerEvent): void => {
    this.stopEdge();
    if (
      !this.edgeEnabled ||
      e.pointerType !== 'mouse' ||
      e.buttons ||
      document.activeElement !== this.canvas
    )
      return;
    const r = this.canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    this.edgeX = x < INPUT.edgePx ? -1 : x > r.width - INPUT.edgePx ? 1 : 0;
    this.edgeY = y < INPUT.edgePx ? -1 : y > r.height - INPUT.edgePx ? 1 : 0;
  };
  private readonly hover = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.buttons === 0)
      this.tool?.onPointerMove({
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        kind: e.pointerType,
        button: 0,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
      });
  };
  private readonly modifier = (e: KeyboardEvent): void => {
    if (e.key === 'Shift' && document.activeElement === this.canvas)
      this.tool?.onAngleModifier?.(e.type === 'keydown');
  };
  private readonly stopEdge = (): void => {
    this.edgeX = this.edgeY = 0;
  };
  private readonly reset = (): void => {
    this.stopEdge();
    this.keyboard.clear();
    this.pointer.cancel();
    this.tool?.onCancel();
    this.tool?.onAngleModifier?.(false);
  };
  /** Opt in to desktop edge scrolling; turning it off stops an active scroll. */
  setEdgeScrolling(enabled: boolean): void {
    this.edgeEnabled = enabled;
    this.stopEdge();
  }
  /** Swap the active tool, cancelling any unfinished interaction. Null enables inspect pan. */
  setTool(tool: InputTool | null): void {
    this.pointer.cancel();
    this.tool = tool;
  }
  /** Poll held keys and long press. No per-frame allocation; long frames cannot cause jumps. */
  update(seconds: number): void {
    this.gestures.tick(performance.now());
    const dt = Math.min(INPUT.maxDeltaSeconds, Math.max(0, seconds)),
      k = this.keyboard;
    let x = k.held('KeyD') - k.held('KeyA') + this.edgeX;
    let y = k.held('KeyS') - k.held('KeyW') + this.edgeY;
    const length = Math.max(1, Math.hypot(x, y));
    x /= length;
    y /= length;
    if (x || y) {
      this.camera.copyState(this.state);
      const speed = this.state.distance * INPUT.panDistancePerSecond * dt;
      this.panAxes(x * speed, y * speed);
    }
    const rotate = k.held('KeyE') - k.held('KeyQ'),
      tilt = k.held('KeyR') - k.held('KeyF');
    if (rotate) this.camera.rotate(rotate * INPUT.rotatePerSecond * dt);
    if (tilt) this.camera.tilt(tilt * INPUT.tiltPerSecond * dt);
  }
  /** Remove subscriptions, release captures and cancel unfinished actions. */
  dispose(): void {
    this.pointer.dispose();
    this.keyboard.dispose();
    this.stopEdge();
    this.canvas.removeEventListener('wheel', this.wheel);
    this.canvas.removeEventListener('pointermove', this.edge);
    this.canvas.removeEventListener('pointermove', this.hover);
    window.removeEventListener('keydown', this.modifier);
    window.removeEventListener('keyup', this.modifier);
    this.canvas.removeEventListener('pointerleave', this.stopEdge);
    this.canvas.removeEventListener('blur', this.stopEdge);
    this.canvas.removeEventListener('webglcontextlost', this.reset);
    window.removeEventListener('blur', this.reset);
    document.removeEventListener('visibilitychange', this.reset);
  }
}
