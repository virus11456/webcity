import type { FailureReason } from '../bridge/protocol';
import type { SimClient } from '../bridge/simClient';
import { CELL_SIZE, GAME_MODES } from '../data/config';
import { ZONE_TOOL, type ZoneSelectionMode } from '../data/zoneTool';
import { GROWTH, ZONES } from '../data/zones';
import { ZoneSelection } from '../world/zoneSelection';
import type { Vec2, ZoneBlock, ZoneType } from '../world/types';
import type { ZoneCell } from '../world/zoning';
import type { Tool, ToolPointer } from './tool';

export interface ZoneToolState {
  active: boolean;
  ready: boolean;
  pending: boolean;
  zone: ZoneType | null;
  mode: ZoneSelectionMode;
  selected: number;
  painted: number;
  unlocked: readonly number[];
  reason: FailureReason | 'sim.failed' | null;
}
interface ZoneContext {
  sim: SimClient;
  pick(x: number, y: number): Vec2 | null;
  preview(cells: readonly ZoneCell[], zone: ZoneType | null): void;
  worldChanged(
    blocks: ZoneBlock[],
    heights: Float32Array,
    owned: readonly number[],
  ): void;
}
/** One worker transaction on release; multitouch / Escape can cancel the entire stroke. */
export class ZoneTool implements Tool {
  readonly id = 'zone';
  private selection: ZoneSelection | undefined;
  private start: Vec2 | null = null;
  private last: Vec2 | null = null;
  private cells = new Map<string, ZoneCell>();
  private epoch = 0;
  private disposed = false;
  private failed = false;
  private readonly unsubscribe: () => void;
  private state: ZoneToolState = {
    active: false,
    ready: false,
    pending: false,
    zone: 'RL',
    mode: 'fill',
    selected: 0,
    painted: 0,
    unlocked: [],
    reason: null,
  };
  constructor(
    private readonly ctx: ZoneContext,
    private readonly changed: (s: Readonly<ZoneToolState>) => void,
  ) {
    this.unsubscribe = ctx.sim.onEvent((e) => {
      if (e.t === 'zonesChanged' && e.occupancyOnly) return;
      if (['ready', 'roadsChanged', 'zonesChanged', 'milestone'].includes(e.t))
        this.refresh();
      else if (e.t === 'error') {
        this.failed = true;
        this.state.ready = false;
        this.onCancel();
        this.state.reason = 'sim.failed';
        this.publish();
      }
    });
    this.refresh();
  }
  readState(): Readonly<ZoneToolState> {
    return { ...this.state };
  }
  private refresh(): void {
    const w = this.ctx.sim.mirror.readRoadWorld();
    if (!w || this.failed) return;
    const blocks = this.ctx.sim.mirror.readZoneBlocks();
    this.selection = new ZoneSelection({ ...w, zoneBlocks: blocks });
    this.state.ready = true;
    this.state.unlocked = GAME_MODES[w.mode].allUnlocked
      ? Object.values(ZONES).map((z) => z.unlock)
      : [...w.unlocked];
    // A world edit invalidates a held selection, rather than submitting stale block IDs.
    this.onCancel();
    this.ctx.worldChanged(blocks, w.heights, w.ownedTiles);
  }
  private publish(): void {
    if (this.disposed) return;
    this.state.selected = this.cells.size;
    this.ctx.preview(
      this.state.active ? [...this.cells.values()] : [],
      this.state.zone,
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
  setZone(zone: ZoneType | null): void {
    if (
      this.state.pending ||
      (zone !== null &&
        (!Object.hasOwn(ZONES, zone) ||
          !this.state.unlocked.includes(ZONES[zone].unlock)))
    )
      return;
    this.onCancel();
    this.state.zone = zone;
    this.publish();
  }
  setMode(mode: ZoneSelectionMode): void {
    if (this.state.pending) return;
    this.onCancel();
    this.state.mode = mode;
    this.publish();
  }
  onCancel(): void {
    this.epoch++;
    this.start = this.last = null;
    this.cells.clear();
    this.state.reason = null;
    this.publish();
  }
  private select(p: Vec2): void {
    if (!this.selection || !this.start) return;
    let next: ZoneCell[];
    const { mode, zone } = this.state;
    if (mode === 'fill') {
      this.cells.clear();
      next = this.selection.fill(p, zone);
    } else if (mode === 'rectangle') {
      this.cells.clear();
      next = this.selection.rectangle(this.start, p, zone);
    } else
      next = this.selection.brush(
        this.last ?? p,
        p,
        CELL_SIZE * GROWTH.brushRadiusCells[mode === 'small' ? 0 : 1],
        zone,
      );
    for (const cell of next) this.cells.set(cell.join(':'), cell);
    this.last = p;
    this.state.reason =
      this.cells.size > ZONE_TOOL.maxCellsPerCommand ? 'err.zoneLimit' : null;
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
    const p = this.ctx.pick(e.x, e.y);
    this.onCancel();
    if (!p) return;
    this.start = this.last = p;
    this.select(p);
  }
  onPointerMove(e: ToolPointer): void {
    if (!this.start || this.state.pending || !this.state.active) return;
    const p = this.ctx.pick(e.x, e.y);
    if (p) this.select(p);
    else this.last = null;
  }
  onPointerUp(e: ToolPointer): void {
    if (!this.start || this.state.pending || !this.state.active) return;
    const p = this.ctx.pick(e.x, e.y);
    if (!p) {
      this.onCancel();
      return;
    }
    this.select(p);
    this.start = this.last = null;
    if (!this.cells.size || this.state.reason) return;
    const cells = [...this.cells.values()],
      epoch = this.epoch;
    this.state.pending = true;
    this.publish();
    void this.ctx.sim
      .send({ t: 'zone', cells, zone: this.state.zone })
      .then((result) => {
        this.state.pending = false;
        if (result.t === 'result' && result.ok) {
          this.state.painted = cells.length;
          this.cells.clear();
        } else if (epoch === this.epoch)
          this.state.reason =
            result.t === 'result'
              ? (result.reason ?? 'err.invalidCommand')
              : 'err.invalidCommand';
        this.publish();
      })
      .catch(() => {
        this.failed = true;
        this.state.pending = false;
        this.state.ready = false;
        this.cells.clear();
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
