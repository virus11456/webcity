import { buildingsChangeFootprints } from '../bridge/buildingChanges';
import type { FailureReason } from '../bridge/protocol';
import { ROADS, type RoadTypeId } from '../data/roads';
import { previewStraightRoad, snapRoadPoint } from '../world/roadGeometry';
import {
  checkRoadBudget,
  type ConstructionPreview,
  type RoadConstructionWorld,
} from '../world/roadConstruction';
import type { Vec2 } from '../world/types';
import type { Tool, ToolContext, ToolPointer } from './tool';

export interface RoadToolState {
  active: boolean;
  ready: boolean;
  pending: boolean;
  phase: 'start' | 'end' | 'confirm';
  type: RoadTypeId;
  angleSnap: boolean;
  preview: ConstructionPreview | null;
  reason: FailureReason | 'sim.failed' | null;
  money: number;
  segments: number;
  unlocked: readonly number[];
}
/** Two-point straight-road tool; only worker acknowledgement advances a continuous chain. */
export class RoadTool implements Tool {
  readonly id = 'road';
  private world: RoadConstructionWorld | undefined;
  private anchor: Vec2 | null = null;
  private end: Vec2 | null = null;
  private down: ToolPointer | null = null;
  private epoch = 0;
  private shift = false;
  private disposed = false;
  private readonly unsubscribe: () => void;
  private state: RoadToolState = {
    active: false,
    ready: false,
    pending: false,
    phase: 'start',
    type: 'road_small',
    angleSnap: true,
    preview: null,
    reason: null,
    money: 0,
    segments: 0,
    unlocked: [],
  };
  constructor(
    private readonly ctx: ToolContext,
    private readonly changed: (state: Readonly<RoadToolState>) => void,
  ) {
    this.unsubscribe = ctx.sim.onEvent((event) => {
      if (event.t === 'buildingsChanged') {
        if (buildingsChangeFootprints(event)) this.refreshWorld(false);
        return;
      }
      if (event.t === 'zonesChanged' && event.occupancyOnly) return;
      if (
        event.t === 'ready' ||
        event.t === 'roadsChanged' ||
        event.t === 'zonesChanged' ||
        event.t === 'milestone'
      )
        this.refreshWorld();
      else if (event.t === 'fundsChanged' || event.t === 'stats') {
        const money =
          event.t === 'fundsChanged' ? event.money : event.stats.money;
        if (this.world && money !== this.world.money) {
          this.world.money = money;
          this.state.money = money;
          this.recalculate();
        }
      } else if (event.t === 'error') {
        this.state.ready = false;
        this.onCancel();
        this.state.reason = 'sim.failed';
        this.publish();
      }
    });
    this.refreshWorld();
  }
  /** Read the latest tool view without exposing authoritative simulation data. */
  readState(): Readonly<RoadToolState> {
    return { ...this.state };
  }
  private refreshWorld(render = true): void {
    this.world = this.ctx.sim.mirror.readRoadWorld();
    if (!this.world) return;
    this.state.ready = true;
    this.state.money = this.world.money;
    this.state.segments = this.world.segments.length;
    this.state.unlocked = [...this.world.unlocked];
    if (render) this.ctx.worldChanged(this.world);
    this.recalculate();
  }
  private publish(): void {
    if (this.disposed) return;
    this.ctx.preview(
      this.state.active ? this.state.preview : null,
      this.state.active ? this.anchor : null,
    );
    this.changed({ ...this.state });
  }
  private recalculate(): void {
    this.state.preview =
      this.anchor && this.end && this.world
        ? checkRoadBudget(
            previewStraightRoad(
              {
                type: this.state.type,
                start: this.anchor,
                end: this.end,
                snap: { angle: this.state.angleSnap && !this.shift },
              },
              this.world,
            ),
            this.state.type,
            this.world,
          )
        : null;
    this.publish();
  }
  /** Start accepting road points without changing camera controls for multi-touch. */
  activate(): void {
    this.state.active = true;
    this.state.reason = null;
    this.publish();
  }
  /** Cancel the draft; an already submitted worker operation still completes. */
  deactivate(): void {
    this.state.active = false;
    this.onCancel();
  }
  /** Select a road type; availability is still enforced by the worker. */
  setType(type: RoadTypeId): void {
    if (this.state.pending || !Object.hasOwn(ROADS, type)) return;
    this.state.type = type;
    this.state.reason = null;
    this.recalculate();
  }
  /** Toggle persistent angle snapping; Shift temporarily disables it. */
  setAngleSnap(enabled: boolean): void {
    this.state.angleSnap = enabled;
    this.recalculate();
  }
  /** Apply the current keyboard modifier without losing the chosen endpoints. */
  onAngleModifier(disabled: boolean): void {
    if (this.shift !== disabled) {
      this.shift = disabled;
      this.recalculate();
    }
  }
  /** Remember a press only; placement happens on release so multi-touch can cancel it. */
  onPointerDown(event: ToolPointer): void {
    if (
      this.state.active &&
      !this.state.pending &&
      this.state.ready &&
      event.button === 0
    )
      this.down = { ...event };
  }
  /** Mouse hover previews the endpoint; touch placement waits for a tap. */
  onPointerMove(event: ToolPointer): void {
    // Drag callbacks arrive only after the shared gesture recognizer crosses its slop.
    this.down = null;
    if (
      !this.state.active ||
      this.state.pending ||
      !this.anchor ||
      event.kind !== 'mouse'
    )
      return;
    this.shift = Boolean(event.shift);
    this.end = this.ctx.pick(event.x, event.y);
    this.state.reason = null;
    this.recalculate();
  }
  /** Mouse commits on the second click; touch locks a draft for the confirm button. */
  onPointerUp(event: ToolPointer): void {
    const down = this.down;
    this.down = null;
    if (!down || !this.world || !this.state.active || this.state.pending)
      return;
    const point = this.ctx.pick(event.x, event.y);
    if (!point) return;
    this.state.reason = null;
    if (!this.anchor) {
      this.anchor = snapRoadPoint(point, this.world).pos;
      this.end = null;
      this.state.phase = 'end';
      this.recalculate();
    } else {
      this.end = { ...point };
      this.shift = Boolean(event.shift);
      this.state.phase = 'confirm';
      this.recalculate();
      if (event.kind === 'mouse') this.onConfirm();
    }
  }
  /** Abandon unfinished points; pending acknowledgements cannot resurrect this draft. */
  onCancel(): void {
    this.epoch++;
    this.down = null;
    this.anchor = this.end = null;
    this.state.phase = 'start';
    this.state.preview = null;
    this.state.reason = null;
    this.publish();
  }
  /** Submit at most once; the authoritative response decides success and the next start. */
  onConfirm(): void {
    void this.commit();
  }
  private async commit(): Promise<void> {
    const preview = this.state.preview;
    if (
      !this.state.active ||
      !this.state.ready ||
      this.state.pending ||
      !preview?.canBuild ||
      !preview.preview
    )
      return;
    const epoch = this.epoch,
      points = structuredClone(preview.preview.draft),
      type = this.state.type;
    this.state.pending = true;
    this.publish();
    try {
      const response = await this.ctx.sim.send({
        t: 'buildRoad',
        type,
        points,
      });
      if (epoch !== this.epoch || !this.state.active) return;
      if (response.t === 'result' && response.ok) {
        this.anchor = { ...points.end };
        this.end = null;
        this.state.phase = 'end';
        this.state.reason = null;
      } else {
        this.state.reason =
          response.t === 'result'
            ? (response.reason ?? 'err.invalidCommand')
            : 'err.invalidCommand';
      }
    } catch {
      // A timed-out request may have committed: do not retry a potentially charged road.
      this.state.ready = false;
      this.state.reason = 'sim.failed';
      this.anchor = this.end = null;
    } finally {
      this.state.pending = false;
      this.recalculate();
    }
  }
  /** Stop listening and remove the draft when leaving this application instance. */
  dispose(): void {
    this.deactivate();
    this.disposed = true;
    this.unsubscribe();
  }
}
