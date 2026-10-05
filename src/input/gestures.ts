import { INPUT } from '../data/input';

export interface Point {
  x: number;
  y: number;
}
export interface InputPointer extends Point {
  id: number;
  kind: string;
  button: number;
  ctrl: boolean;
}
export interface GestureSink {
  start(p: InputPointer): void;
  drag(p: InputPointer, dx: number, dy: number): void;
  end(p: InputPointer): void;
  tap(p: InputPointer): void;
  longPress(p: InputPointer): void;
  cancel(): void;
  pair(
    dx: number,
    dy: number,
    scale: number,
    angle: number,
    center: Point,
    tilt: boolean,
  ): void;
}
interface Pair {
  x: number;
  y: number;
  distance: number;
  angle: number;
}
const angleDelta = (a: number, b: number): number =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Stateful recognizer; after multi-touch, no single action resumes until every finger lifts. */
export class Gestures {
  private readonly points = new Map<number, InputPointer>();
  private origin: InputPointer | null = null;
  private started = 0;
  private dragging = false;
  private held = false;
  private multi = false;
  private blocked = false;
  private pairOrigin: Pair | null = null;
  private previous: Pair | null = null;
  private pairDirty = false;
  private readonly nextPair: Pair = { x: 0, y: 0, distance: 1, angle: 0 };
  private firstId = 0;
  private secondId = 0;
  private mode: 'tilt' | 'transform' | null = null;
  constructor(private readonly sink: GestureSink) {}
  private sample(out: Pair): void {
    const a = this.points.get(this.firstId),
      b = this.points.get(this.secondId);
    if (!a || !b) return;
    out.x = (a.x + b.x) / 2;
    out.y = (a.y + b.y) / 2;
    out.distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    out.angle = Math.atan2(b.y - a.y, b.x - a.x);
  }
  /** Begin a pointer; a second contact immediately cancels the tool action. */
  down(p: InputPointer, now: number): void {
    this.points.set(p.id, p);
    if (this.points.size === 1) {
      this.origin = p;
      this.firstId = p.id;
      this.started = now;
      this.sink.start(p);
    } else {
      this.sink.cancel();
      this.multi = true;
      if (this.points.size === 2 && !this.blocked) {
        this.secondId = p.id;
        this.sample(this.nextPair);
        this.pairOrigin = { ...this.nextPair };
        this.previous = { ...this.nextPair };
      } else this.blocked = true;
    }
  }
  /** Recognize movement, locking parallel vertical two-finger motion to tilt. */
  move(p: InputPointer): void {
    const old = this.points.get(p.id);
    if (!old) return;
    this.points.set(p.id, p);
    if (this.blocked) return;
    if (this.multi) {
      this.pairDirty = true;
      return;
    }
    if (!this.origin) return;
    if (
      !this.dragging &&
      Math.hypot(p.x - this.origin.x, p.y - this.origin.y) >= INPUT.dragSlopPx
    ) {
      this.dragging = true;
      this.sink.drag(p, p.x - this.origin.x, p.y - this.origin.y);
    } else if (this.dragging) this.sink.drag(p, p.x - old.x, p.y - old.y);
  }
  // Batch the two pointermove events for one touch sample before classifying it.
  private flushPair(): void {
    if (!this.pairDirty || this.blocked) return;
    this.pairDirty = false;
    if (this.points.size !== 2 || !this.previous || !this.pairOrigin) return;
    this.sample(this.nextPair);
    const next = this.nextPair,
      base = this.pairOrigin;
    const dx = next.x - base.x,
      dy = next.y - base.y;
    if (!this.mode) {
      if (
        Math.abs(next.distance / base.distance - 1) > INPUT.pairScaleSlop ||
        Math.abs(angleDelta(next.angle, base.angle)) > INPUT.pairAngleSlop
      )
        this.mode = 'transform';
      else if (Math.hypot(dx, dy) > INPUT.pairSlopPx)
        this.mode =
          Math.abs(dy) > Math.abs(dx) * INPUT.verticalDominance
            ? 'tilt'
            : 'transform';
    }
    if (this.mode) {
      const previous = this.previous;
      this.sink.pair(
        next.x - previous.x,
        next.y - previous.y,
        previous.distance / next.distance,
        angleDelta(next.angle, previous.angle),
        next,
        this.mode === 'tilt',
      );
      Object.assign(this.previous, next);
    }
  }
  /** Emit one long press; called with a monotonic clock from the frame loop. */
  tick(now: number): void {
    this.flushPair();
    if (
      this.origin &&
      !this.multi &&
      !this.blocked &&
      !this.dragging &&
      !this.held &&
      this.origin.button === 0 &&
      now - this.started >= INPUT.longPressMs
    ) {
      this.held = true;
      this.sink.cancel();
      this.sink.longPress(this.origin);
    }
  }
  /** Finish without converting a drag, long press or multi-touch into a tap. */
  up(p: InputPointer): void {
    if (!this.points.has(p.id)) return;
    this.move(p);
    this.flushPair();
    this.points.delete(p.id);
    if (!this.multi && !this.blocked && !this.held) {
      this.sink.end(p);
      if (!this.dragging) this.sink.tap(p);
    }
    if (this.points.size === 0) this.clear();
  }
  private clear(): void {
    this.points.clear();
    this.origin = null;
    this.pairOrigin = this.previous = null;
    this.dragging = this.held = this.multi = this.blocked = false;
    this.mode = null;
    this.pairDirty = false;
  }
  /** Abandon all contacts on focus loss, capture loss or disposal. */
  cancel(): void {
    if (this.points.size) this.sink.cancel();
    this.clear();
  }
}
