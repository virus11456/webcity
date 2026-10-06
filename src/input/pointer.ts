import { Gestures, type InputPointer } from './gestures';

/** Capture every canvas pointer so drags can finish outside the viewport. */
export class PointerInput {
  private readonly active = new Map<number, InputPointer>();
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gestures: Gestures,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.lost);
    canvas.addEventListener('contextmenu', this.prevent);
    canvas.addEventListener('webglcontextlost', this.cancel);
    window.addEventListener('blur', this.cancel);
    document.addEventListener('visibilitychange', this.visibility);
  }
  private point(e: PointerEvent): InputPointer {
    return {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      kind: e.pointerType,
      button: this.active.get(e.pointerId)?.button ?? e.button,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
    };
  }
  private readonly prevent = (e: Event): void => e.preventDefault();
  private readonly down = (e: PointerEvent): void => {
    if (e.button < 0 || e.button > 2 || this.active.has(e.pointerId)) return;
    e.preventDefault();
    this.canvas.focus({ preventScroll: true });
    const p = this.point(e);
    this.active.set(e.pointerId, p);
    this.canvas.setPointerCapture(e.pointerId);
    this.gestures.down(p, performance.now());
  };
  private readonly move = (e: PointerEvent): void => {
    if (!this.active.has(e.pointerId)) return;
    e.preventDefault();
    this.gestures.move(this.point(e));
  };
  private readonly up = (e: PointerEvent): void => {
    if (!this.active.has(e.pointerId)) return;
    e.preventDefault();
    this.gestures.up(this.point(e));
    this.active.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
  };
  private readonly lost = (e: PointerEvent): void => {
    if (this.active.has(e.pointerId)) this.cancel();
  };
  private readonly visibility = (): void => {
    if (document.hidden) this.cancel();
  };
  /** Clear contacts and release captures without synthesizing a tool commit. */
  readonly cancel = (): void => {
    const ids = [...this.active.keys()];
    this.active.clear();
    this.gestures.cancel();
    for (const id of ids)
      if (this.canvas.hasPointerCapture(id))
        this.canvas.releasePointerCapture(id);
  };
  /** Remove all listeners and release outstanding captures. */
  dispose(): void {
    this.cancel();
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('lostpointercapture', this.lost);
    this.canvas.removeEventListener('contextmenu', this.prevent);
    this.canvas.removeEventListener('webglcontextlost', this.cancel);
    window.removeEventListener('blur', this.cancel);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
