export type Shortcut = 'pause' | 'cancel' | 'speed1' | 'speed2' | 'speed3';
const shortcuts: Record<string, Shortcut> = {
  Space: 'pause',
  Escape: 'cancel',
  Digit1: 'speed1',
  Digit2: 'speed2',
  Digit3: 'speed3',
};
const movement = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyR',
  'KeyF',
]);

/** Keyboard state scoped to the focused canvas, preserving form and browser shortcuts. */
export class KeyboardInput {
  private readonly keys = new Set<string>();
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly shortcut: (action: Shortcut) => void,
  ) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
    canvas.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }
  private readonly down = (e: KeyboardEvent): void => {
    if (
      document.activeElement !== this.canvas ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.isComposing
    )
      return;
    const action = shortcuts[e.code];
    if (!movement.has(e.code) && !action) return;
    e.preventDefault();
    if (movement.has(e.code)) this.keys.add(e.code);
    if (action && !e.repeat) this.shortcut(action);
  };
  private readonly up = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  /** Return a held key as an axis contribution without allocating objects. */
  held(code: string): number {
    return this.keys.has(code) ? 1 : 0;
  }
  /** Drop held keys when the canvas loses focus. */
  readonly clear = (): void => {
    this.keys.clear();
  };
  /** Unsubscribe all keyboard listeners. */
  dispose(): void {
    this.clear();
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.clear);
    this.canvas.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.clear);
  }
}
