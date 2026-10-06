import { buildingsChangeFootprints } from '../bridge/buildingChanges';
import type { SimClient } from '../bridge/simClient';
import type { FailureReason } from '../bridge/protocol';
import { BULLDOZE } from '../data/bulldoze';
import {
  quoteBulldoze,
  type BulldozeKind,
  type BulldozeTarget,
  type BulldozeWorld,
} from '../world/bulldoze';
import {
  BulldozeSelection,
  type BulldozeShape,
} from '../world/bulldozeSelection';
import type { Vec2 } from '../world/types';
import type { Tool, ToolPointer } from './tool';

export interface BulldozeToolState {
  active: boolean;
  ready: boolean;
  pending: boolean;
  kind: BulldozeKind;
  selected: number;
  refund: number;
  cost: number;
  lastRefund: number;
  lastCost: number;
  removed: number;
  reason: FailureReason | 'sim.failed' | null;
}
interface Context {
  sim: SimClient;
  pick(x: number, y: number): Vec2 | null;
  preview(
    shapes: readonly BulldozeShape[],
    heights: Float32Array | undefined,
  ): void;
}
/** Preview a whole stroke and submit on release, so multitouch can cancel safely. */
export class BulldozeTool implements Tool {
  readonly id = 'bulldoze';
  private world: BulldozeWorld | undefined;
  private selection: BulldozeSelection | undefined;
  private last: Vec2 | null = null;
  private targets = new Map<string, BulldozeTarget>();
  private epoch = 0;
  private failed = false;
  private disposed = false;
  private readonly unsubscribe: () => void;
  private state: BulldozeToolState = {
    active: false,
    ready: false,
    pending: false,
    kind: 'segment',
    selected: 0,
    refund: 0,
    cost: 0,
    lastRefund: 0,
    lastCost: 0,
    removed: 0,
    reason: null,
  };
  constructor(
    private readonly ctx: Context,
    private readonly changed: (s: Readonly<BulldozeToolState>) => void,
  ) {
    this.unsubscribe = ctx.sim.onEvent((e) => {
      if (e.t === 'buildingsChanged') {
        if (buildingsChangeFootprints(e)) this.refresh(true);
        return;
      }
      if (e.t === 'zonesChanged' && e.occupancyOnly) return;
      if (
        ['ready', 'roadsChanged', 'zonesChanged', 'networksChanged'].includes(
          e.t,
        )
      )
        this.refresh();
      else if (
        e.t === 'clock' &&
        this.world &&
        e.clock.day !== this.world.day
      ) {
        this.world.day = e.clock.day;
        this.publish();
      } else if (e.t === 'error') {
        this.failed = true;
        this.state.ready = false;
        this.onCancel();
        this.state.reason = 'sim.failed';
        this.publish();
      }
    });
    this.refresh();
  }
  readState(): Readonly<BulldozeToolState> {
    return { ...this.state };
  }
  private refresh(preserveGesture = false): void {
    if (this.failed) return;
    this.world = this.ctx.sim.mirror.readBulldozeWorld();
    if (!this.world) return;
    this.selection = new BulldozeSelection(this.world);
    this.state.ready = true;
    if (!preserveGesture) this.onCancel();
    else this.publish();
  }
  private publish(): void {
    if (this.disposed) return;
    const targets = [...this.targets.values()],
      quote = this.world ? quoteBulldoze(this.world, targets) : null;
    this.state.selected = targets.length;
    this.state.refund = quote?.refund ?? 0;
    this.state.cost = quote?.cost ?? 0;
    if (targets.length > BULLDOZE.maxTargets)
      this.state.reason = 'err.bulldozeLimit';
    this.ctx.preview(
      this.state.active ? (this.selection?.outlines(targets) ?? []) : [],
      this.world?.heights,
    );
    this.changed({ ...this.state });
  }
  activate(): void {
    this.state.active = true;
    this.state.reason = null;
    this.publish();
  }
  deactivate(): void {
    this.state.active = false;
    this.onCancel();
  }
  setKind(kind: BulldozeKind): void {
    if (this.state.pending) return;
    this.onCancel();
    this.state.kind = kind;
    this.publish();
  }
  onCancel(): void {
    this.epoch++;
    this.last = null;
    this.targets.clear();
    this.state.reason = null;
    this.publish();
  }
  private add(a: Vec2, b: Vec2): void {
    for (const t of this.selection?.pick(a, b, this.state.kind) ?? [])
      this.targets.set(`${t.kind}:${t.id}`, t);
    this.state.reason = null;
    this.publish();
  }
  onPointerDown(e: ToolPointer): void {
    if (
      !this.state.active ||
      !this.state.ready ||
      this.state.pending ||
      e.button !== 0
    )
      return;
    this.onCancel();
    const p = this.ctx.pick(e.x, e.y);
    if (p) {
      this.last = p;
      this.add(p, p);
    }
  }
  onPointerMove(e: ToolPointer): void {
    if (!this.state.active || !this.state.ready || this.state.pending) return;
    const p = this.ctx.pick(e.x, e.y);
    if (this.last) {
      if (p) {
        this.add(this.last, p);
        this.last = p;
      } else this.onCancel();
    } else if (e.kind === 'mouse') {
      this.targets.clear();
      if (p) this.add(p, p);
      else this.publish();
    }
  }
  onPointerUp(e: ToolPointer): void {
    if (!this.last || !this.state.active || this.state.pending) return;
    const p = this.ctx.pick(e.x, e.y);
    if (!p) {
      this.onCancel();
      return;
    }
    this.add(this.last, p);
    this.last = null;
    if (!this.targets.size || this.state.reason) return;
    const targets = [...this.targets.values()],
      epoch = this.epoch;
    this.state.pending = true;
    this.publish();
    void this.ctx.sim
      .send({ t: 'bulldoze', targets })
      .then((r) => {
        this.state.pending = false;
        if (r.t === 'result' && r.ok) {
          this.state.removed = targets.length;
          this.state.lastRefund = r.refund ?? 0;
          this.state.lastCost = r.cost ?? 0;
          this.targets.clear();
        } else if (epoch === this.epoch)
          this.state.reason =
            r.t === 'result'
              ? (r.reason ?? 'err.invalidCommand')
              : 'err.invalidCommand';
        this.publish();
      })
      .catch(() => {
        this.failed = true;
        this.state.ready = false;
        this.state.pending = false;
        this.targets.clear();
        this.state.reason = 'sim.failed';
        this.publish();
      });
  }
  dispose(): void {
    this.unsubscribe();
    this.deactivate();
    this.disposed = true;
  }
}
