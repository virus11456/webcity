import { DISTRICTS as D } from '../data/districts';
import type { SimClient } from '../bridge/simClient';
import type { FailureReason } from '../bridge/protocol';
import type { DistrictAction, DistrictView } from '../world/districts';
import type { Vec2 } from '../world/types';
import type { Tool, ToolPointer } from './tool';
export interface DistrictToolState {
  active: boolean;
  pending: boolean;
  selected: number | null;
  radius: number;
  erase: boolean;
  districts: DistrictView[];
  ownedTiles: number[];
  reason: FailureReason | 'sim.failed' | null;
  points: Vec2[];
}
export class DistrictTool implements Tool {
  readonly id = 'district';
  private state: DistrictToolState = {
    active: false,
    pending: false,
    selected: null,
    radius: D.smallRadiusM,
    erase: false,
    districts: [],
    ownedTiles: [],
    reason: null,
    points: [],
  };
  private armed = false;
  private stop: () => void;
  constructor(
    private sim: SimClient,
    private pick: (x: number, y: number) => Vec2 | null,
    private changed: (s: DistrictToolState) => void,
  ) {
    const refresh = () => {
      this.state.ownedTiles = sim.mirror.readOwnedTiles();
      this.state.districts = sim.mirror.readDistricts();
      if (!this.state.districts.some((d) => d.id === this.state.selected))
        this.state.selected = this.state.districts[0]?.id ?? null;
      this.publish();
    };
    this.stop = sim.onEvent((e) => {
      if (e.t === 'ready' || e.t === 'districts') refresh();
    });
    refresh();
  }
  readState() {
    return structuredClone(this.state);
  }
  private publish() {
    this.changed(this.readState());
  }
  activate() {
    this.state.active = true;
    this.publish();
  }
  deactivate() {
    this.state.active = false;
    this.onCancel();
  }
  select(id: number) {
    this.onCancel();
    this.state.selected = id;
    this.publish();
  }
  brush(radius: number, erase: boolean) {
    this.onCancel();
    this.state.radius = radius;
    this.state.erase = erase;
    this.publish();
  }
  onPointerDown(e: ToolPointer) {
    if (
      !this.state.active ||
      this.state.pending ||
      e.button !== 0 ||
      (!this.state.erase && this.state.selected === null)
    )
      return;
    this.armed = true;
    this.sample(e);
  }
  onPointerMove(e: ToolPointer) {
    if (this.armed) this.sample(e);
  }
  private sample(e: ToolPointer) {
    const p = this.pick(e.x, e.y);
    if (!p) return;
    const last = this.state.points.at(-1);
    if (last && Math.hypot(last.x - p.x, last.z - p.z) < D.cellM / 2) return;
    if (this.state.points.length < D.maxStrokePoints) this.state.points.push(p);
    this.publish();
  }
  onPointerUp(e: ToolPointer) {
    if (!this.armed) return;
    this.sample(e);
    this.armed = false;
    const points = this.state.points;
    this.state.points = [];
    if (points.length)
      void this.command({
        action: 'paint',
        id: this.state.erase ? null : this.state.selected,
        points,
        radius: this.state.radius,
      });
  }
  onCancel() {
    this.armed = false;
    this.state.points = [];
    this.publish();
  }
  async command(c: DistrictAction) {
    if (this.state.pending) return;
    this.state.pending = true;
    this.state.reason = null;
    this.publish();
    try {
      const r = await this.sim.send({ t: 'district', ...c });
      if (r.t === 'result') {
        this.state.reason = r.ok ? null : (r.reason ?? 'err.invalidCommand');
        if (r.ok && c.action === 'create')
          this.state.selected = this.state.districts.at(-1)?.id ?? null;
      }
    } catch {
      this.state.reason = 'sim.failed';
    } finally {
      this.state.pending = false;
      this.publish();
    }
  }
  dispose() {
    this.stop();
  }
}
