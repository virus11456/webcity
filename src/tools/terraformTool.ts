import { WORLD } from '../data/config';
import { TERRAFORM as T } from '../data/terraform';
import {
  previewTerraform,
  type TerraformDraft,
  type TerraformPreview,
} from '../world/terraform';
import type { RoadConstructionWorld } from '../world/roadConstruction';
import type { Vec2 } from '../world/types';
import type { SimClient } from '../bridge/simClient';
import type { FailureReason } from '../bridge/protocol';
import type { Tool, ToolPointer } from './tool';
export interface TerraformToolState {
  active: boolean;
  pending: boolean;
  draft: TerraformDraft;
  preview: TerraformPreview | null;
  reason: FailureReason | 'sim.failed' | null;
}
export class TerraformTool implements Tool {
  readonly id = 'terraform';
  private world?: RoadConstructionWorld;
  private state: TerraformToolState = {
    active: false,
    pending: false,
    draft: { mode: 'raise', radius: 64, points: [] },
    preview: null,
    reason: null,
  };
  private armed = false;
  private stop: () => void;
  constructor(
    private sim: SimClient,
    private pick: (x: number, y: number) => Vec2 | null,
    private changed: (s: TerraformToolState) => void,
  ) {
    const refresh = () => {
      this.world = sim.mirror.readRoadWorld();
      this.publish();
    };
    this.stop = sim.onEvent((e) => {
      if (
        ['ready', 'roadsChanged', 'buildingsChanged', 'tilesChanged'].includes(
          e.t,
        )
      )
        refresh();
    });
    refresh();
  }
  readState() {
    return structuredClone(this.state);
  }
  private publish() {
    this.state.preview =
      this.world && this.state.draft.points.length
        ? previewTerraform(this.world, this.state.draft)
        : null;
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
  configure(mode: TerraformDraft['mode'], radius: TerraformDraft['radius']) {
    if (this.state.pending) return;
    this.onCancel();
    this.state.draft.mode = mode;
    this.state.draft.radius = radius;
    this.publish();
  }
  onCancel() {
    this.armed = false;
    this.state.draft.points = [];
    this.state.reason = null;
    this.publish();
  }
  private sample(e: ToolPointer) {
    const p = this.pick(e.x, e.y),
      last = this.state.draft.points.at(-1);
    if (
      !p ||
      (last &&
        Math.hypot(p.x - last.x, p.z - last.z) < WORLD.heightmapSpacingM / 2)
    )
      return;
    if (this.state.draft.points.length < T.maxPoints)
      this.state.draft.points.push(p);
    this.publish();
  }
  onPointerDown(e: ToolPointer) {
    if (!this.state.active || this.state.pending || e.button !== 0) return;
    this.state.draft.points = [];
    this.state.reason = null;
    this.armed = true;
    this.sample(e);
  }
  onPointerMove(e: ToolPointer) {
    if (this.armed) this.sample(e);
  }
  onPointerUp(e: ToolPointer) {
    if (this.armed) this.sample(e);
    this.armed = false;
  }
  async onConfirm() {
    if (this.state.pending || !this.state.preview || this.state.preview.reason)
      return;
    this.state.pending = true;
    this.publish();
    try {
      const r = await this.sim.send({
        t: 'terraform',
        draft: structuredClone(this.state.draft),
      });
      if (r.t === 'result') {
        this.state.reason = r.ok ? null : (r.reason ?? 'err.invalidCommand');
        if (r.ok) this.state.draft.points = [];
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
    this.state.active = false;
    this.onCancel();
  }
}
