import { previewTrees, treeBrush } from '../world/parks';
import { PARKS } from '../data/parks';
import type { SimClient } from '../bridge/simClient';
import type { FailureReason } from '../bridge/protocol';
import type { ServiceId } from '../data/services';
import {
  ServiceNetwork,
  previewService,
  serviceDefinition,
  type ServicePreview,
} from '../world/services';
import { buildingsChangeFootprints } from '../bridge/buildingChanges';
import type { PowerWorld } from '../world/power';
import type { Vec2 } from '../world/types';
import type { Tool, ToolPointer } from './tool';
export interface ServiceToolState {
  active: boolean;
  pending: boolean;
  ready: boolean;
  unlocked: readonly number[];
  preview: ServicePreview | null;
  reason: FailureReason | 'sim.failed' | null;
  rotation: number;
  defId: ServiceId;
}
export interface ServiceToolContext {
  sim: SimClient;
  pick(x: number, y: number): Vec2 | null;
  preview(p: ServicePreview | null): void;
}
/** Shared confirm-before-commit gesture; two-finger cancellation never sends a command. */
export class ServiceTool implements Tool {
  readonly id: string;
  private world: PowerWorld | undefined;
  private point: Vec2 | null = null;
  private treePoints = new Map<string, Vec2>();
  private treeLast: Vec2 | null = null;
  private network?: ServiceNetwork;
  private armed = false;
  private disposed = false;
  private readonly unsubscribe: () => void;
  protected state: ServiceToolState;
  constructor(
    private readonly ctx: ServiceToolContext,
    private readonly changed: (s: ServiceToolState) => void,
  ) {
    this.id = 'service';
    this.state = {
      active: false,
      pending: false,
      ready: false,
      unlocked: [],
      preview: null,
      reason: null,
      rotation: 0,
      defId: 'police_station',
    };
    const refresh = () => {
      this.world = ctx.sim.mirror.readPowerWorld();
      this.network = this.world
        ? new ServiceNetwork(this.world.nodes, this.world.segments)
        : undefined;
      this.state.ready = !!this.world;
      this.state.unlocked = this.world?.unlocked ?? [];
      this.publish();
    };
    this.unsubscribe = ctx.sim.onEvent((e) => {
      if (
        ['ready', 'milestone', 'roadsChanged'].includes(e.t) ||
        (e.t === 'buildingsChanged' && buildingsChangeFootprints(e))
      )
        refresh();
      else if (e.t === 'economy') this.publish();
      else if (e.t === 'fundsChanged' && this.world) {
        this.world.money = e.money;
        this.publish();
      } else if (e.t === 'error') {
        this.state.ready = false;
        this.state.reason = 'sim.failed';
        this.onCancel();
      }
    });
    refresh();
  }
  readState(): ServiceToolState {
    return { ...this.state };
  }
  private publish() {
    if (this.disposed) return;
    this.state.preview =
      this.state.active && this.world && this.point
        ? this.state.defId === 'tree'
          ? previewTrees(this.world, [...this.treePoints.values()])
          : previewService(
              this.world,
              this.state.defId,
              this.point,
              this.state.rotation,
              this.ctx.sim.mirror.readFinance()?.budgets[
                serviceDefinition(this.state.defId)!.service ?? 'parks'
              ] ?? 1,
              this.network,
            )
        : null;
    if (this.state.active) this.ctx.preview(this.state.preview);
    this.changed({ ...this.state });
  }
  activate() {
    this.state.active = true;
    this.publish();
  }
  deactivate() {
    this.ctx.preview(null);
    this.state.active = false;
    this.onCancel();
  }
  setDefinition(id: ServiceId) {
    if (this.state.pending) return;
    this.onCancel();
    this.state.defId = id;
    this.state.reason = null;
    this.publish();
  }
  rotate() {
    if (this.state.pending) return;
    this.state.rotation = (this.state.rotation + Math.PI / 2) % (Math.PI * 2);
    this.publish();
  }
  onCancel() {
    if (this.state.ready) this.state.reason = null;
    this.armed = false;
    this.point = null;
    this.treePoints.clear();
    this.treeLast = null;
    this.state.preview = null;
    this.publish();
  }
  onPointerDown(e: ToolPointer) {
    if (
      this.state.active &&
      this.state.ready &&
      !this.state.pending &&
      e.button === 0
    ) {
      this.armed = true;
      if (this.state.defId === 'tree') {
        this.treeLast = null;
        const p = this.ctx.pick(e.x, e.y);
        if (p) this.paintTrees(p);
      }
    }
  }
  private paintTrees(p: Vec2) {
    for (const point of treeBrush(this.treeLast ?? p, p)) {
      if (this.treePoints.size >= PARKS.maxBrushTrees) break;
      this.treePoints.set(`${point.x}:${point.z}`, point);
    }
    this.treeLast = this.point = p;
    this.state.reason = null;
    this.publish();
  }
  onPointerMove(e: ToolPointer) {
    if (this.state.defId === 'tree') {
      if (this.state.active && this.armed && !this.state.pending) {
        const p = this.ctx.pick(e.x, e.y);
        if (p) this.paintTrees(p);
      }
      return;
    }
    if (!this.state.active || this.state.pending || e.kind !== 'mouse') return;
    this.point = this.ctx.pick(e.x, e.y);
    this.state.reason = null;
    this.publish();
  }
  onPointerUp(e: ToolPointer) {
    if (!this.armed || this.state.pending) return;
    this.armed = false;
    const p = this.ctx.pick(e.x, e.y);
    if (!p) return;
    if (this.state.defId === 'tree') this.paintTrees(p);
    else this.point = p;
    this.state.reason = null;
    this.publish();
  }
  onConfirm() {
    if (
      !this.state.active ||
      !this.state.ready ||
      this.state.pending ||
      !this.state.preview?.valid ||
      !this.point
    )
      return;
    this.state.pending = true;
    this.publish();
    const command =
      this.state.defId === 'tree'
        ? { t: 'plantTrees' as const, points: [...this.treePoints.values()] }
        : {
            t: 'place' as const,
            defId: this.state.defId,
            pos: this.point,
            rotation: this.state.rotation,
          };
    void this.ctx.sim
      .send(command)
      .then((r) => {
        if (this.disposed) return;
        this.state.pending = false;
        if (r.t === 'result' && r.ok) {
          this.state.reason = null;
          this.onCancel();
        } else {
          this.state.reason =
            r.t === 'result'
              ? (r.reason ?? 'err.invalidCommand')
              : 'err.invalidCommand';
          this.publish();
        }
      })
      .catch(() => {
        this.state.pending = false;
        this.state.ready = false;
        this.state.reason = 'sim.failed';
        this.onCancel();
      });
  }
  dispose() {
    this.unsubscribe();
    this.deactivate();
    this.disposed = true;
  }
}
