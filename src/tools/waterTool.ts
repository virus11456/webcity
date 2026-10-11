import type { SimClient } from '../bridge/simClient';
import type { FailureReason } from '../bridge/protocol';
import { buildingsChangeFootprints } from '../bridge/buildingChanges';
import type { WaterFacilityId } from '../data/waterUtility';
import {
  previewPipe,
  previewRoadPipes,
  previewWaterFacility,
  snapPipe,
  type WaterWorld,
  type WaterPreview,
} from '../world/waterUtility';
import type { Vec2 } from '../world/types';
import type { Tool, ToolPointer } from './tool';
export type WaterMode = WaterFacilityId | 'pipe' | 'roads';
export interface WaterToolState {
  active: boolean;
  pending: boolean;
  ready: boolean;
  unlocked: readonly number[];
  mode: WaterMode;
  rotation: number;
  preview: WaterPreview | null;
  reason: FailureReason | 'sim.failed' | null;
}
export interface WaterToolContext {
  sim: SimClient;
  pick(x: number, y: number): Vec2 | null;
  preview(p: WaterPreview | null): void;
}
/** Explicit confirmation, including one atomic auto-road transaction; camera gestures cancel drafts. */
export class WaterTool implements Tool {
  readonly id = 'water';
  private state: WaterToolState = {
    active: false,
    pending: false,
    ready: false,
    unlocked: [],
    mode: 'water_tower',
    rotation: 0,
    preview: null,
    reason: null,
  };
  private world: WaterWorld | undefined;
  private point: Vec2 | null = null;
  private anchor: Vec2 | null = null;
  private armed = false;
  private disposed = false;
  private unsubscribe: () => void;
  constructor(
    private ctx: WaterToolContext,
    private changed: (s: WaterToolState) => void,
  ) {
    const refresh = () => {
      this.world = ctx.sim.mirror.readPowerWorld('water');
      this.state.ready = !!this.world;
      this.state.unlocked = this.world?.unlocked ?? [];
      this.publish();
    };
    this.unsubscribe = ctx.sim.onEvent((e) => {
      if (
        e.t === 'ready' ||
        e.t === 'tilesChanged' ||
        e.t === 'milestone' ||
        e.t === 'roadsChanged' ||
        e.t === 'networksChanged' ||
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
  readState() {
    return { ...this.state };
  }
  private publish() {
    if (this.disposed) return;
    const s = this.state,
      w = this.world;
    s.preview =
      s.active && w
        ? s.mode === 'roads'
          ? previewRoadPipes(w)
          : this.point
            ? s.mode === 'pipe'
              ? this.anchor
                ? previewPipe(w, [this.anchor, this.point])
                : null
              : previewWaterFacility(w, s.mode, this.point, s.rotation)
            : null
        : null;
    if (s.active) this.ctx.preview(s.preview);
    this.changed({ ...s });
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
  setMode(mode: WaterMode) {
    if (this.state.pending) return;
    this.onCancel();
    this.state.mode = mode;
    this.publish();
  }
  rotate() {
    if (
      this.state.pending ||
      this.state.mode === 'pipe' ||
      this.state.mode === 'roads'
    )
      return;
    this.state.rotation = (this.state.rotation + Math.PI / 2) % (Math.PI * 2);
    this.publish();
  }
  onCancel() {
    this.armed = false;
    this.point = this.anchor = null;
    if (this.state.ready) this.state.reason = null;
    if (this.state.mode === 'roads') this.state.mode = 'pipe';
    this.publish();
  }
  onPointerDown(e: ToolPointer) {
    if (
      this.state.active &&
      this.state.ready &&
      !this.state.pending &&
      e.button === 0 &&
      this.state.mode !== 'roads'
    )
      this.armed = true;
  }
  onPointerMove(e: ToolPointer) {
    if (
      !this.state.active ||
      this.state.pending ||
      e.kind !== 'mouse' ||
      this.state.mode === 'roads'
    )
      return;
    this.point = this.pick(e);
    this.state.reason = null;
    this.publish();
  }
  private pick(e: ToolPointer) {
    const p = this.ctx.pick(e.x, e.y);
    return p && this.world && this.state.mode === 'pipe'
      ? snapPipe(this.world, p)
      : p;
  }
  onPointerUp(e: ToolPointer) {
    if (!this.armed || this.state.pending) return;
    this.armed = false;
    const p = this.pick(e);
    if (!p) return;
    this.point = p;
    if (this.state.mode === 'pipe' && !this.anchor) this.anchor = p;
    this.state.reason = null;
    this.publish();
  }
  onConfirm() {
    const s = this.state;
    if (!s.active || !s.ready || s.pending || !s.preview?.valid) return;
    const command =
      s.mode === 'roads'
        ? { t: 'buildRoadPipes' as const }
        : s.mode === 'pipe'
          ? {
              t: 'buildNetwork' as const,
              net: 'water' as const,
              points: [this.anchor!, this.point!],
            }
          : {
              t: 'place' as const,
              defId: s.mode,
              pos: this.point!,
              rotation: s.rotation,
            };
    s.pending = true;
    this.publish();
    void this.ctx.sim
      .send(command)
      .then((r) => {
        if (this.disposed) return;
        s.pending = false;
        if (r.t === 'result' && r.ok) this.onCancel();
        else {
          s.reason =
            r.t === 'result'
              ? (r.reason ?? 'err.invalidCommand')
              : 'err.invalidCommand';
          this.publish();
        }
      })
      .catch(() => {
        if (this.disposed) return;
        s.pending = false;
        s.ready = false;
        s.reason = 'sim.failed';
        this.onCancel();
      });
  }
  dispose() {
    this.unsubscribe();
    this.deactivate();
    this.disposed = true;
  }
}
