import type { SimClient } from '../bridge/simClient';
import type { FailureReason } from '../bridge/protocol';
import type { PowerPlantId } from '../data/power';
import { buildingsChangeFootprints } from '../bridge/buildingChanges';
import {
  previewPlant,
  previewLine,
  type PowerWorld,
  type PowerPreview,
} from '../world/power';
import type { Vec2 } from '../world/types';
import type { Tool, ToolPointer } from './tool';
export interface PowerToolState {
  active: boolean;
  pending: boolean;
  ready: boolean;
  unlocked: readonly number[];
  preview: PowerPreview | null;
  reason: FailureReason | 'sim.failed' | null;
  rotation: number;
  defId: PowerPlantId;
  line: boolean;
}
export interface PowerToolContext {
  sim: SimClient;
  pick(x: number, y: number): Vec2 | null;
  preview(p: PowerPreview | null): void;
}
/** Shared confirm-before-commit gesture; two-finger cancellation never sends a command. */
export class PlaceTool implements Tool {
  readonly id: string;
  private world: PowerWorld | undefined;
  private point: Vec2 | null = null;
  private anchor: Vec2 | null = null;
  private armed = false;
  private disposed = false;
  private readonly unsubscribe: () => void;
  protected state: PowerToolState;
  constructor(
    private readonly ctx: PowerToolContext,
    private readonly changed: (s: PowerToolState) => void,
    line = false,
  ) {
    this.id = line ? 'power-line' : 'power-plant';
    this.state = {
      active: false,
      pending: false,
      ready: false,
      unlocked: [],
      preview: null,
      reason: null,
      rotation: 0,
      defId: 'power_wind',
      line,
    };
    const refresh = () => {
      this.world = ctx.sim.mirror.readPowerWorld();
      this.state.ready = !!this.world;
      this.state.unlocked = this.world?.unlocked ?? [];
      this.publish();
    };
    this.unsubscribe = ctx.sim.onEvent((e) => {
      if (
        [
          'ready',
          'tilesChanged',
          'milestone',
          'roadsChanged',
          'networksChanged',
        ].includes(e.t) ||
        (e.t === 'buildingsChanged' && buildingsChangeFootprints(e))
      )
        refresh();
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
  readState(): PowerToolState {
    return { ...this.state };
  }
  private publish() {
    if (this.disposed) return;
    this.state.preview =
      this.state.active && this.world && this.point
        ? this.state.line
          ? this.anchor
            ? previewLine(this.world, [this.anchor, this.point])
            : null
          : previewPlant(
              this.world,
              this.state.defId,
              this.point,
              this.state.rotation,
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
  setDefinition(id: PowerPlantId) {
    if (this.state.pending) return;
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
    this.point = this.anchor = null;
    this.state.preview = null;
    this.publish();
  }
  onPointerDown(e: ToolPointer) {
    if (
      this.state.active &&
      this.state.ready &&
      !this.state.pending &&
      e.button === 0
    )
      this.armed = true;
  }
  onPointerMove(e: ToolPointer) {
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
    this.point = p;
    if (this.state.line && !this.anchor) this.anchor = p;
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
    const command = this.state.line
      ? {
          t: 'buildNetwork' as const,
          net: 'power' as const,
          points: [this.anchor!, this.point],
        }
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
