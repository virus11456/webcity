import type { SimClient } from '../bridge/simClient';
import type { CommandInput, FailureReason } from '../bridge/protocol';
import { ROADS } from '../data/roads';
import { TRANSIT as C } from '../data/transit';
import { ServiceNetwork } from '../world/services';
import { lanePointAt } from '../world/laneGraph';
import type { Vec2 } from '../world/types';
import type { BusLineView } from '../world/transit';
import type { Tool, ToolPointer } from './tool';
export interface BusToolState {
  active: boolean;
  pending: boolean;
  stops: Vec2[];
  lines: BusLineView[];
  reason: FailureReason | 'sim.failed' | null;
}
export class BusTool implements Tool {
  readonly id = 'bus';
  private armed = false;
  private state: BusToolState = {
    active: false,
    pending: false,
    stops: [],
    lines: [],
    reason: null,
  };
  private network?: ServiceNetwork;
  private stop: () => void;
  private disposed = false;
  constructor(
    private sim: SimClient,
    private pick: (x: number, y: number) => Vec2 | null,
    private changed: (s: BusToolState) => void,
  ) {
    const refresh = () => {
      const w = sim.mirror.readRoadWorld();
      this.network = w ? new ServiceNetwork(w.nodes, w.segments) : undefined;
      this.state.lines = sim.mirror.readTransit();
      this.publish();
    };
    this.stop = sim.onEvent((e) => {
      if (e.t === 'ready' || e.t === 'roadsChanged') refresh();
      if (e.t === 'transit') {
        this.state.lines = e.lines;
        this.publish();
      }
    });
    refresh();
  }
  private publish() {
    if (!this.disposed) this.changed(structuredClone(this.state));
  }
  readState() {
    return structuredClone(this.state);
  }
  activate() {
    this.state.active = true;
    this.publish();
  }
  deactivate() {
    this.state.active = false;
    this.clearDraft();
  }
  onPointerDown(e: ToolPointer) {
    this.armed = this.state.active && !this.state.pending && e.button === 0;
  }
  onPointerMove() {}
  onPointerUp(e: ToolPointer) {
    if (!this.armed) return;
    this.armed = false;
    const p = this.pick(e.x, e.y);
    if (!p || !this.network) return;
    let best: number = C.stopSnapM,
      selected: Vec2 | undefined;
    const access = this.network.access(p);
    for (const link of this.network.links.values()) {
      if (link.segment.elevated) continue;
      if (!access || access.road !== link.segment.id) continue;
      const q = lanePointAt(link.points, access.distance),
        d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < best) {
        const a = lanePointAt(link.points, Math.max(0, access.distance - 1)),
          b = lanePointAt(link.points, access.distance + 1);
        const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const nx = -(b.z - a.z) / length,
          nz = (b.x - a.x) / length;
        const side = (p.x - q.x) * nx + (p.z - q.z) * nz < 0 ? -1 : 1;
        const curb = ROADS[link.segment.type].widthM / 2;
        best = d;
        selected = { x: q.x + nx * side * curb, z: q.z + nz * side * curb };
      }
    }
    if (!selected) {
      this.state.reason = 'err.busRoute';
      this.publish();
      return;
    }
    const first = this.state.stops[0];
    if (
      first &&
      this.state.stops.length >= 2 &&
      Math.hypot(first.x - selected.x, first.z - selected.z) < C.stopSpacingM
    ) {
      this.onConfirm();
      return;
    }
    if (
      this.state.stops.length >= C.maxStops ||
      this.state.stops.some(
        (s) =>
          Math.hypot(s.x - selected!.x, s.z - selected!.z) < C.stopSpacingM,
      )
    )
      return;
    this.state.stops.push(selected);
    this.state.reason = null;
    this.publish();
  }
  onCancel() {
    this.armed = false;
  }
  clearDraft() {
    if (this.state.pending) return;
    this.armed = false;
    this.state.stops = [];
    this.state.reason = null;
    this.publish();
  }
  onConfirm() {
    if (this.state.stops.length >= 2)
      void this.command({ t: 'createBusLine', stops: this.state.stops }, true);
  }
  async command(command: CommandInput, clear = false) {
    if (this.state.pending) return;
    this.state.pending = true;
    this.state.reason = null;
    this.publish();
    try {
      const r = await this.sim.send(command);
      if (r.t === 'result') {
        this.state.reason = r.ok ? null : (r.reason ?? 'err.invalidCommand');
        if (r.ok && clear) this.state.stops = [];
      }
    } catch {
      this.state.reason = 'sim.failed';
    } finally {
      this.state.pending = false;
      this.publish();
    }
  }
  dispose() {
    this.disposed = true;
    this.stop();
  }
}
