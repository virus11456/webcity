import { pickIntersection } from '../world/intersections';
import { INTERSECTIONS } from '../data/intersections';
import { pickUpgradeRoad, previewRoadUpgrade } from '../world/roadUpgrade';
import { distance, lerp, normalize } from '../core/math';
import { ROAD_CURVES } from '../data/roadCurves';
import { buildingsChangeFootprints } from '../bridge/buildingChanges';
import type { FailureReason } from '../bridge/protocol';
import { meshHeightAt } from '../world/heightField';
import { ROAD_RULES, ROADS, type RoadTypeId } from '../data/roads';
import {
  previewStraightRoad,
  snapRoadPoint,
  snapRoadVector,
  roadReferenceAngle,
} from '../world/roadGeometry';
import {
  checkRoadBudget,
  type ConstructionPreview,
  type RoadConstructionWorld,
} from '../world/roadConstruction';
import type { Vec2 } from '../world/types';
import type { Tool, ToolContext, ToolPointer } from './tool';

export type RoadMode = 'straight' | 'curve' | 'free' | 'upgrade' | 'junction';
export interface RoadToolState {
  active: boolean;
  ready: boolean;
  pending: boolean;
  phase: 'start' | 'control' | 'end' | 'confirm';
  mode: RoadMode;
  elevation: number;
  junctionId: number | null;
  junctionControl: 'none' | 'lights' | 'stop';
  banLeft: boolean;
  upgradeCount: number;
  demolitions: number;
  type: RoadTypeId;
  angleSnap: boolean;
  preview: ConstructionPreview | null;
  reason: FailureReason | 'sim.failed' | null;
  money: number;
  segments: number;
  unlocked: readonly number[];
}
/** Straight, three-point curve and free-drag tool; only worker acknowledgement advances a continuous chain. */
export class RoadTool implements Tool {
  readonly id = 'road';
  private world: RoadConstructionWorld | undefined;
  private anchor: Vec2 | null = null;
  private anchorHeight: number | undefined;
  private end: Vec2 | null = null;
  private control: Vec2 | null = null;
  private stroke: Vec2[] = [];
  private upgradeIds = new Set<number>();
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
    mode: 'straight',
    elevation: 0,
    junctionId: null,
    junctionControl: 'none',
    banLeft: false,
    upgradeCount: 0,
    demolitions: 0,
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
        event.t === 'tilesChanged' ||
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
    if (this.state.mode === 'junction') {
      this.state.preview = null;
      if (
        this.state.junctionId !== null &&
        !this.world?.nodes.some(
          (n) => n.id === this.state.junctionId && n.segments.length >= 3,
        )
      ) {
        this.state.junctionId = null;
        this.anchor = null;
      }
      this.publish();
      return;
    }
    if (this.state.mode === 'upgrade' && this.world) {
      const quotes = [...this.upgradeIds].map((id) =>
        previewRoadUpgrade(this.world!, id, this.state.type),
      );
      const last = quotes.at(-1),
        bad = quotes.find((q) => !q.result.canBuild),
        cost = quotes.reduce((n, q) => n + (q.result.preview?.cost ?? 0), 0);
      this.state.preview = last ? structuredClone(last.result) : null;
      this.state.upgradeCount = quotes.length;
      this.state.demolitions = new Set(
        quotes.flatMap((q) => q.removedBuildingIndices),
      ).size;
      if (this.state.preview?.preview) {
        this.state.preview.preview.cost = cost;
        if (bad) {
          this.state.preview.canBuild = false;
          this.state.preview.reason = bad.result.reason;
        } else if (this.world.mode !== 'sandbox' && cost > this.world.money) {
          this.state.preview.canBuild = false;
          this.state.preview.reason = 'err.notEnoughMoney';
        }
      }
      this.publish();
      return;
    }

    this.state.preview =
      this.anchor &&
      this.end &&
      this.world &&
      (this.state.mode !== 'curve' || this.control)
        ? checkRoadBudget(
            previewStraightRoad(
              {
                type: this.state.type,
                start: this.anchor,
                end: this.end,
                ...this.handles(),
                startHeight: this.anchorHeight,
                endHeight:
                  this.state.elevation > 0
                    ? this.heightAt(this.end)
                    : undefined,
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
  private handles(): { c1?: Vec2; c2?: Vec2 } {
    if (!this.anchor || !this.end) return {};
    if (this.state.mode === 'curve' && this.control)
      return {
        c1: lerp(this.anchor, this.control, 2 / 3),
        c2: lerp(this.end, this.control, 2 / 3),
      };
    if (this.state.mode === 'free' && this.stroke.length > 1) {
      const n = this.stroke.length,
        a = normalize({
          x: this.stroke[1]!.x - this.anchor.x,
          z: this.stroke[1]!.z - this.anchor.z,
        }),
        b = normalize({
          x: this.end.x - this.stroke[n - 2]!.x,
          z: this.end.z - this.stroke[n - 2]!.z,
        }),
        h = distance(this.anchor, this.end) * ROAD_CURVES.freeHandleRatio;
      return {
        c1: { x: this.anchor.x + a.x * h, z: this.anchor.z + a.z * h },
        c2: { x: this.end.x - b.x * h, z: this.end.z - b.z * h },
      };
    }
    return {};
  }
  private heightAt(p: Vec2): number {
    return meshHeightAt(this.world!.heights, p.x, p.z) + this.state.elevation;
  }
  setElevation(value: number): void {
    if (this.state.pending || !Number.isFinite(value)) return;
    this.state.elevation = Math.max(
      0,
      Math.min(ROAD_RULES.maxElevationM, value),
    );
    this.recalculate();
  }
  private setAnchor(p: Vec2): void {
    const snapped = snapRoadPoint(
      p,
      this.world!,
      true,
      this.state.elevation > 0 ? this.heightAt(p) : undefined,
    );
    this.anchor = snapped.pos;
    this.anchorHeight = this.state.elevation > 0 ? snapped.height : undefined;
  }
  setJunction(control: 'none' | 'lights' | 'stop', banLeft: boolean): void {
    if (this.state.pending) return;
    this.state.junctionControl = control;
    this.state.banLeft = banLeft;
    this.publish();
  }
  setMode(mode: RoadMode): void {
    if (
      this.state.pending ||
      !['straight', 'curve', 'free', 'upgrade', 'junction'].includes(mode) ||
      (mode === 'junction' &&
        !this.state.unlocked.includes(INTERSECTIONS.unlock))
    )
      return;
    this.onCancel();
    this.state.mode = mode;
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
    ) {
      this.down = { ...event };
      if (this.state.mode === 'upgrade') {
        this.upgradeIds.clear();
        this.selectUpgrade(event);
      }
      if (this.state.mode === 'free' && this.world) {
        const p = this.ctx.pick(event.x, event.y);
        if (p) {
          this.setAnchor(p);
          this.stroke = [this.anchor!];
          this.end = null;
          this.state.phase = 'end';
          this.recalculate();
        }
      }
    }
  }
  private selectUpgrade(event: ToolPointer): void {
    if (!this.world) return;
    const p = this.ctx.pick(event.x, event.y);
    if (!p) return;
    const id = pickUpgradeRoad(this.world, p);
    if (id !== undefined) this.upgradeIds.add(id);
    this.state.phase = 'confirm';
    this.recalculate();
  }
  /** Mouse hover previews the endpoint; touch placement waits for a tap. */
  onPointerMove(event: ToolPointer): void {
    if (this.state.mode === 'junction') {
      this.down = null;
      return;
    }
    if (
      this.state.mode === 'upgrade' &&
      this.state.active &&
      !this.state.pending
    ) {
      if (!this.down) this.upgradeIds.clear();
      this.selectUpgrade(event);
      return;
    }
    if (
      this.state.mode === 'free' &&
      this.down &&
      this.anchor &&
      !this.state.pending
    ) {
      const p = this.ctx.pick(event.x, event.y);
      if (
        p &&
        distance(p, this.stroke[this.stroke.length - 1]!) >= ROAD_CURVES.sampleM
      ) {
        this.stroke.push(p);
        this.end = p;
        this.recalculate();
      }
      return;
    }
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
    if (this.state.mode === 'upgrade') {
      this.selectUpgrade(event);
      if (event.kind === 'mouse') this.onConfirm();
      return;
    }
    const point = this.ctx.pick(event.x, event.y);
    if (!point) return;
    if (this.state.mode === 'junction') {
      const node = pickIntersection(this.world.nodes, point);
      this.state.junctionId = node?.id ?? null;
      this.anchor = node?.pos ?? null;
      if (node) {
        this.state.junctionControl = node.control;
        this.state.banLeft = node.banLeft ?? false;
        this.state.phase = 'confirm';
      }
      this.state.reason = null;
      this.publish();
      return;
    }
    this.state.reason = null;
    if (!this.anchor) {
      this.setAnchor(point);
      this.end = null;
      this.state.phase = this.state.mode === 'curve' ? 'control' : 'end';
      this.recalculate();
    } else if (this.state.mode === 'curve' && !this.control) {
      this.control = snapRoadVector(
        this.anchor,
        point,
        roadReferenceAngle(
          snapRoadPoint(this.anchor, this.world),
          point,
          this.world,
        ),
        { angle: this.state.angleSnap && !event.shift },
      );
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
    this.anchor = this.end = this.control = null;
    this.anchorHeight = undefined;
    this.state.junctionId = null;
    this.stroke = [];
    this.upgradeIds.clear();
    this.state.upgradeCount = this.state.demolitions = 0;
    this.state.phase = 'start';
    this.state.preview = null;
    this.state.reason = null;
    this.publish();
  }
  /** Submit at most once; the authoritative response decides success and the next start. */
  onConfirm(): void {
    if (this.state.mode === 'junction') void this.commitJunction();
    else void this.commit();
  }
  private async commitJunction(): Promise<void> {
    if (
      !this.state.active ||
      !this.state.ready ||
      this.state.pending ||
      this.state.junctionId === null
    )
      return;
    this.state.pending = true;
    this.state.reason = null;
    this.publish();
    const epoch = this.epoch;
    try {
      const r = await this.ctx.sim.send({
        t: 'setIntersection',
        node: this.state.junctionId,
        control: this.state.junctionControl,
        banLeft: this.state.banLeft,
      });
      if (epoch === this.epoch && r.t === 'result' && !r.ok)
        this.state.reason = r.reason ?? 'err.invalidCommand';
    } catch {
      this.state.reason = 'sim.failed';
      this.state.ready = false;
    } finally {
      this.state.pending = false;
      this.publish();
    }
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
      if (this.state.mode === 'upgrade') {
        for (const segment of this.upgradeIds) {
          if (epoch !== this.epoch || !this.state.active) break;
          const response = await this.ctx.sim.send({
            t: 'upgradeRoad',
            segment,
            type,
          });
          if (response.t !== 'result' || !response.ok) {
            this.state.reason =
              response.t === 'result'
                ? (response.reason ?? 'err.invalidCommand')
                : 'err.invalidCommand';
            break;
          }
        }
        this.upgradeIds.clear();
        this.state.phase = 'start';
        return;
      }
      const response = await this.ctx.sim.send({
        t: 'buildRoad',
        type,
        points,
      });
      if (epoch !== this.epoch || !this.state.active) return;
      if (response.t === 'result' && response.ok) {
        this.anchor = { ...points.end };
        this.anchorHeight = points.endHeight;
        this.end = this.control = null;
        this.stroke = [];
        this.state.phase = this.state.mode === 'curve' ? 'control' : 'end';
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
