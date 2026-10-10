import type { SimClient } from '../bridge/simClient';
import type { InspectInfo } from '../world/snapshot';
import type { Vec2 } from '../world/types';
import {
  BulldozeSelection,
  type BulldozeShape,
} from '../world/bulldozeSelection';
import type { BulldozeTarget } from '../world/bulldoze';

/** Tap-only inspection leaves camera dragging and two-finger gestures with the input layer. */
export class InspectTool {
  private selection?: BulldozeSelection;
  private heights?: Float32Array;
  private target?: BulldozeTarget | { kind: 'vehicle'; id: number };
  private vehicleTick = -1;
  private epoch = 0;
  private pending = false;
  private dirty = false;
  private disposed = false;
  private readonly off: () => void;
  constructor(
    private readonly client: SimClient,
    private readonly pick: (x: number, y: number) => Vec2 | null,
    private readonly changed: (info: InspectInfo | null) => void,
    private readonly highlight: (
      shapes: readonly BulldozeShape[],
      heights?: Float32Array,
    ) => void,
    private readonly pickVehicle?: (x: number, y: number) => number | null,
  ) {
    this.off = client.onEvent((e) => {
      if (
        e.t === 'ready' ||
        e.t === 'roadsChanged' ||
        e.t === 'buildingsChanged'
      ) {
        if (e.t !== 'buildingsChanged' || e.added.length || e.removed.length)
          this.refresh();
        if (this.target) void this.request();
      }
      if (
        e.t === 'vehicles' &&
        this.target?.kind === 'vehicle' &&
        e.tick !== this.vehicleTick
      ) {
        this.vehicleTick = e.tick ?? this.vehicleTick + 1;
        void this.request();
      }
      if (e.t === 'roadTraffic' && this.target?.kind === 'segment')
        void this.request();
      if (e.t === 'error') this.clear();
    });
    this.refresh();
  }
  private refresh() {
    const world = this.client.mirror.readBulldozeWorld();
    this.selection = world ? new BulldozeSelection(world) : undefined;
    this.heights = world?.heights;
  }
  /** Select the closest building first, then road; empty ground dismisses the panel. */
  tap(x: number, y: number): void {
    const vehicle = this.pickVehicle?.(x, y);
    if (vehicle != null) {
      this.clear();
      this.target = { kind: 'vehicle', id: vehicle };
      void this.request();
      return;
    }
    const p = this.pick(x, y);
    const target =
      p &&
      (this.selection?.pick(p, p, 'building')[0] ??
        this.selection?.pick(p, p, 'segment')[0]);
    this.clear();
    if (!target) return;
    this.target = target;
    void this.request();
  }
  private async request() {
    if (this.pending) {
      this.dirty = true;
      return;
    }
    if (!this.target || this.disposed) return;
    const epoch = this.epoch,
      target = this.target;
    this.pending = true;
    try {
      const result = await this.client.send({ t: 'inspect', target });
      if (epoch !== this.epoch || this.disposed) return;
      if (result.t !== 'inspectResult') {
        this.clear();
        return;
      }
      this.changed(result.info);
      this.highlight(
        target.kind === 'vehicle'
          ? []
          : (this.selection?.outlines([target]) ?? []),
        this.heights,
      );
    } catch {
      if (epoch === this.epoch) this.clear();
    } finally {
      this.pending = false;
      if (this.dirty) {
        this.dirty = false;
        void this.request();
      }
    }
  }
  /** Clear late replies and selection without changing the world. */
  clear(): void {
    this.epoch++;
    this.target = undefined;
    this.changed(null);
    this.highlight([], this.heights);
  }
  /** Release the event subscription and ignore late Worker replies. */
  dispose(): void {
    this.disposed = true;
    this.off();
    this.clear();
  }
}
