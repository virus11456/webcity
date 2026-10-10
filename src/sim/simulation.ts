import {
  chargeConstruction,
  financeView,
  settleEconomy,
  setTax,
  setBudget,
  takeLoan,
  repayLoan,
} from './systems/economy';
import type { BudgetDepartment } from '../data/economy';
import { updateProblems } from './systems/problems';
import { updateWater } from './systems/water';
import {
  previewWaterFacility,
  previewPipe,
  previewRoadPipes,
  waterDefinition,
} from '../world/waterUtility';
import { updatePower } from './systems/power';
import {
  previewPlant,
  previewLine,
  plantDefinition,
  type PowerWorld,
} from '../world/power';
import { PROBLEMS } from '../data/simulation';
import type { Building, Vec2 } from '../world/types';
import { updateDemand } from './systems/demand';
import { updatePopulation } from './systems/population';
import { GrowthSystem } from './systems/growth';
import { planBulldoze, type BulldozeTarget } from '../world/bulldoze';
import { roadAccess } from '../world/roadAccess';
import { refreshRoadAccess } from './systems/roadAccess';
import { paintZones, type ZoneCell } from '../world/zoning';
import type { ZoneType } from '../world/types';
import { rebuildZoneGrid } from '../world/zoneGrid';
import { roadBedPatch } from '../world/roadBed';
import { roadHeightAt } from '../world/roadProfile';
import { GAME_MODES } from '../data/config';
import type { RoadTypeId } from '../data/roads';
import { RoadGraph } from '../world/roadGraph';
import { validateRoadDraft } from '../world/roadConstruction';
import type { RoadDraft } from '../world/snapshot';
import type { Result } from '../bridge/protocol';
import type { SimEvent } from '../bridge/protocol';
import type { Unsubscribe } from '../core/events';
import { TimeSystem, type DayBoundary } from './systems/time';
import { TIME, type SimSpeed } from '../data/config';
import { SIM_RUNTIME } from '../data/simRuntime';
import type {
  BuildingPatch,
  CitySettings,
  SimClock,
  WorldSnapshot,
} from '../world/snapshot';
import { createState, type SimState } from './state';

const tickMs = (TIME.secondsPerDay[1] * 1000) / TIME.ticksPerDay;

/** Deterministic simulation; no browser, wall clock or worker required. */
export class Simulation {
  private readonly state: SimState;
  private accumulatedMs = 0;
  private readonly time = new TimeSystem();
  private readonly growth = new GrowthSystem();

  constructor(
    settings: CitySettings,
    private readonly emit: (event: SimEvent) => void = () => {},
    restored?: WorldSnapshot,
  ) {
    this.state = createState(settings);
    if (restored) {
      const copy = structuredClone(restored),
        terrain = this.state.terrain;
      Object.assign(terrain, copy.terrain);
      Object.assign(this.state, copy, { terrain });
    }
    this.time.onDay(() => {
      const population = updatePopulation(this.state, true);
      const power = [...updatePower(this.state), ...updateWater(this.state)];
      const problems = updateProblems(this.state);
      const reconciliation = problems.some(
        (p) => p.state === 'abandoned' && p.stateTimer === 0,
      )
        ? [
            ...updatePopulation(this.state),
            ...updatePower(this.state),
            ...updateWater(this.state),
            ...updateProblems(this.state),
          ]
        : [];
      updateDemand(this.state);
      const updates = new Map<number, BuildingPatch>();
      for (const p of [...population, ...power, ...problems, ...reconciliation])
        updates.set(p.id, { ...updates.get(p.id), ...p });
      const updated = [...updates.values()];
      if (updated.length)
        this.emit({
          t: 'buildingsChanged',
          added: [],
          removed: [],
          updated: structuredClone(updated),
        });
    });
    this.time.onWeek(() => {
      settleEconomy(this.state);
      this.emit({ t: 'fundsChanged', money: this.state.money });
      this.emit({ t: 'economy', finance: financeView(this.state) });
    });
  }

  /** Return one copied asset without exposing mutable simulation state. */
  inspect(
    kind: string,
    id: number,
  ): import('../world/snapshot').InspectInfo | null {
    const s = this.state;
    if (kind === 'building') {
      const value = s.buildings.find((b) => b.id === id);
      return value ? { kind, value: structuredClone(value) } : null;
    }
    if (kind === 'segment') {
      const value = s.segments.find((b) => b.id === id);
      return value ? { kind, value: structuredClone(value) } : null;
    }
    return null;
  }

  get gameOver(): boolean {
    return this.state.economy.status === 'gameOver';
  }
  finance(
    command:
      | { t: 'setTax'; zone: ZoneType; rate: number }
      | { t: 'setBudget'; dept: BudgetDepartment; value: number }
      | { t: 'takeLoan'; bank: number }
      | { t: 'repayLoan'; index: number },
  ): Omit<Result, 't' | 'reqId'> {
    if (this.gameOver) return { ok: false, reason: 'err.gameOver' };
    const s = this.state;
    const result =
      command.t === 'setTax'
        ? setTax(s, command.zone, command.rate)
        : command.t === 'setBudget'
          ? setBudget(s, command.dept, command.value)
          : command.t === 'takeLoan'
            ? takeLoan(s, command.bank)
            : repayLoan(s, command.index);
    if (result.ok) {
      if (command.t === 'setBudget') this.refreshPower();
      this.emit({ t: 'fundsChanged', money: s.money });
      this.emit({ t: 'economy', finance: financeView(s) });
    }
    return result;
  }

  private powerWorld(): PowerWorld {
    const s = this.state;
    return {
      ...s,
      heights: s.terrain.heights,
      mode: s.settings.mode,
      networks: s.networks.power,
    };
  }
  private refreshPower(): void {
    const patches = [
      ...updatePower(this.state),
      ...updateWater(this.state),
      ...updateProblems(this.state),
    ];
    if (patches.some((p) => p.state === 'abandoned' && p.stateTimer === 0))
      patches.push(
        ...updatePopulation(this.state),
        ...updatePower(this.state),
        ...updateWater(this.state),
        ...updateProblems(this.state),
      );
    const merged = new Map<number, BuildingPatch>();
    for (const p of patches) merged.set(p.id, { ...merged.get(p.id), ...p });
    const updated = [...merged.values()];
    if (updated.length)
      this.emit({
        t: 'buildingsChanged',
        added: [],
        removed: [],
        updated: structuredClone(updated),
      });
    this.emit({
      t: 'stats',
      stats: structuredClone(this.state.stats),
      transient: true,
    });
  }
  place(
    defId: string,
    pos: Vec2,
    rotation: number,
  ): Omit<Result, 't' | 'reqId'> {
    const d = waterDefinition(defId) ?? plantDefinition(defId),
      preview = waterDefinition(defId)
        ? previewWaterFacility(this.powerWorld(), defId, pos, rotation)
        : previewPlant(this.powerWorld(), defId, pos, rotation);
    if (!preview.valid || !d || !d.footprintCells)
      return { ok: false, reason: preview.reason ?? 'err.invalidCommand' };
    const charge = chargeConstruction(this.state, preview.cost);
    if (!charge.ok) return charge;
    const s = this.state,
      id = s.nextId++;
    const b: Building = {
      id,
      kind: 'utility',
      defId,
      level: 1,
      pos: { ...pos },
      rotation: rotation % (Math.PI * 2),
      lotW: d.footprintCells[0],
      lotD: d.footprintCells[1],
      seed: (s.seed + id) >>> 0,
      state: 'active',
      stateTimer: 0,
      flags: 0,
      households: 0,
      residents: 0,
      jobs: 0,
      workers: 0,
      builtDay: s.clock.day,
      paidCost: preview.cost,
      problemTimers: Object.fromEntries(
        Object.keys(PROBLEMS).map((p) => [p, 0]),
      ) as Building['problemTimers'],
    };
    s.buildings = [...s.buildings, b];

    const zones = rebuildZoneGrid({ ...s, heights: s.terrain.heights });
    s.zoneBlocks = zones.blocks;
    s.segments = zones.segments;
    s.nextId = zones.nextId;
    this.emit({
      t: 'buildingsChanged',
      added: [structuredClone(b)],
      removed: [],
      updated: [],
    });
    this.emit({
      t: 'zonesChanged',
      blocks: structuredClone(zones.blocks),
      removed: zones.removed,
    });
    this.emit({
      t: 'roadsChanged',
      added: structuredClone(s.segments),
      removed: [],
      nodes: [],
      removedNodes: [],
    });
    this.emit({ t: 'fundsChanged', money: s.money });
    this.refreshPower();
    return { ok: true, cost: preview.cost };
  }
  buildPowerLine(points: Vec2[]): Omit<Result, 't' | 'reqId'> {
    const p = previewLine(this.powerWorld(), points);
    if (!p.valid)
      return { ok: false, reason: p.reason ?? 'err.invalidCommand' };
    const charge = chargeConstruction(this.state, p.cost);
    if (!charge.ok) return charge;
    const s = this.state,
      n = {
        id: s.nextId++,
        points: structuredClone(points),
        builtDay: s.clock.day,
        paidCost: p.cost,
      };
    s.networks.power = [...s.networks.power, n];

    this.emit({
      t: 'networksChanged',
      net: 'power',
      added: [structuredClone(n)],
      removed: [],
    });
    this.emit({ t: 'fundsChanged', money: s.money });
    this.refreshPower();
    return { ok: true, cost: p.cost };
  }

  buildWaterPipes(points?: Vec2[]): Omit<Result, 't' | 'reqId'> {
    const s = this.state,
      w = { ...this.powerWorld(), networks: s.networks.water };
    const preview = points ? previewPipe(w, points) : previewRoadPipes(w);
    if (!preview.valid)
      return { ok: false, reason: preview.reason ?? 'err.invalidCommand' };
    const charge = chargeConstruction(s, preview.cost);
    if (!charge.ok) return charge;
    const paths = preview.paths ?? [preview.points];
    const added = paths.map((path) => ({
      id: s.nextId++,
      points: structuredClone(path),
      builtDay: s.clock.day,
      paidCost: previewPipe({ ...w, money: Infinity }, path, true).cost,
    }));
    s.networks.water = [...s.networks.water, ...added];

    this.emit({
      t: 'networksChanged',
      net: 'water',
      added: structuredClone(added),
      removed: [],
    });
    this.emit({ t: 'fundsChanged', money: s.money });
    this.refreshPower();
    return { ok: true, cost: preview.cost };
  }

  /** Register an authoritative worker system to run at each completed day. */
  onDay(system: (state: SimState, boundary: DayBoundary) => void): Unsubscribe {
    return this.time.onDay((boundary) => system(this.state, boundary));
  }

  /** Register weekly settlement after daily systems, before the day's stats. */
  onWeek(
    system: (state: SimState, boundary: DayBoundary) => void,
  ): Unsubscribe {
    return this.time.onWeek((boundary) => system(this.state, boundary));
  }

  /** Copy just the clock, safe for subscribers to retain. */
  readClock(): SimClock {
    return { ...this.state.clock };
  }

  /** Copy all arrays; callers cannot mutate the authoritative city. */
  snapshot(): WorldSnapshot {
    return structuredClone(this.state);
  }

  /** Validate and atomically commit a ground road, also while paused; clients cannot supply prices. */
  buildRoad(type: RoadTypeId, points: RoadDraft): Omit<Result, 't' | 'reqId'> {
    const s = this.state;
    const result = validateRoadDraft(type, points, {
      ...s,
      heights: s.terrain.heights,
      mode: s.settings.mode,
    });
    if (!result.canBuild || !result.preview)
      return { ok: false, reason: result.reason ?? 'err.invalidCommand' };
    const p = result.preview;
    const cost = GAME_MODES[s.settings.mode].unlimitedMoney ? 0 : p.cost;
    const change = RoadGraph.previewRoad(
      s,
      {
        type,
        start: p.start.pos,
        end: p.end.pos,
        c1: p.draft.c1,
        c2: p.draft.c2,
        startHeight: p.start.height,
        endHeight: p.end.height,
        builtDay: s.clock.day,
        paidCost: cost,
      },
      (point) => roadHeightAt(s.nodes, s.segments, s.terrain.heights, point),
    );
    const charge = chargeConstruction(s, cost);
    if (!charge.ok) return charge;
    const removed = new Set(change.removed),
      removedNodes = new Set(change.removedNodes);
    const nodes = new Map(
      s.nodes.filter((n) => !removedNodes.has(n.id)).map((n) => [n.id, n]),
    );
    for (const node of change.nodes) nodes.set(node.id, node);
    s.nodes = [...nodes.values()];
    s.segments = [
      ...s.segments.filter((segment) => !removed.has(segment.id)),
      ...change.added,
    ];
    for (const item of [...change.nodes, ...change.added])
      s.nextId = Math.max(s.nextId, item.id + 1);

    const terrain = roadBedPatch(s.terrain.heights, s.nodes, s.segments);
    terrain.indices.forEach((index, i) => {
      s.terrain.heights[index] = terrain.heights[i]!;
    });
    if (terrain.indices.length) s.terrain.revision++;
    const zones = rebuildZoneGrid({ ...s, heights: s.terrain.heights });
    s.zoneBlocks = zones.blocks;
    s.segments = zones.segments;
    s.nextId = zones.nextId;
    const segmentById = new Map(
      s.segments.map((segment) => [segment.id, segment]),
    );
    this.emit({
      t: 'roadsChanged',
      ...structuredClone(change),
      added: change.added.map((segment) =>
        structuredClone(segmentById.get(segment.id)!),
      ),
      terrain: { ...terrain, revision: s.terrain.revision },
    });
    this.emit({
      t: 'zonesChanged',
      blocks: structuredClone(zones.blocks),
      removed: zones.removed,
    });
    this.emit({ t: 'fundsChanged', money: s.money });
    const anchors = new Map<number, { zoneBlock: number; blockCell: number }>();
    for (const block of s.zoneBlocks)
      block.buildingAt.forEach((id, index) => {
        if (id !== -1 && !anchors.has(id))
          anchors.set(id, { zoneBlock: block.id, blockCell: index });
      });
    const relinked = s.buildings.filter((b) => {
      if (b.kind !== 'zoned') return false;
      const a = anchors.get(b.id);
      if (b.zoneBlock === a?.zoneBlock && b.blockCell === a?.blockCell)
        return false;
      b.zoneBlock = a?.zoneBlock;
      b.blockCell = a?.blockCell;
      return true;
    });
    const restored = [
      ...new Map(
        [...relinked, ...refreshRoadAccess(s)].map((b) => [b.id, b]),
      ).values(),
    ];
    if (restored.length)
      this.emit({
        t: 'buildingsChanged',
        added: [],
        removed: [],
        updated: structuredClone(restored),
      });
    if (s.buildings.length) this.refreshPopulation();
    return { ok: true, cost };
  }

  /** Delete an entire acknowledged stroke and settle the authoritative quote exactly once. */
  bulldoze(targets: BulldozeTarget[]): Omit<Result, 't' | 'reqId'> {
    if (this.gameOver) return { ok: false, reason: 'err.gameOver' };
    const s = this.state;
    const result = planBulldoze(
      {
        ...s,
        heights: s.terrain.heights,
        day: s.clock.day,
        mode: s.settings.mode,
      },
      targets,
    );
    if (!result.ok) return { ok: false, reason: result.reason };
    const hadAccess = roadAccess(s.nodes, s.segments);
    const connected = new Set(s.buildings.filter(hadAccess).map((b) => b.id));
    s.nodes = result.nodes;
    s.segments = result.zones.segments;
    s.zoneBlocks = result.zones.blocks;
    s.nextId = result.zones.nextId;
    const removedBuildings = new Set(result.removedBuildings);
    s.buildings = result.buildings;
    s.networks = result.networks;
    s.money += result.refund - result.cost;
    s.stats.money = s.money;
    const updated = [
      ...new Map(
        [...result.relinked, ...refreshRoadAccess(s, connected)].map((b) => [
          b.id,
          b,
        ]),
      ).values(),
    ];
    // Include surviving segments because their zoneBlockIds may have changed during rebuild.
    this.emit({
      t: 'roadsChanged',
      ...structuredClone(result.change),
      added: structuredClone(s.segments),
    });
    this.emit({
      t: 'zonesChanged',
      blocks: structuredClone(s.zoneBlocks),
      removed: result.zones.removed,
    });
    this.emit({
      t: 'buildingsChanged',
      added: [],
      removed: result.removedBuildings,
      updated: structuredClone(updated),
    });
    for (const net of ['power', 'water'] as const)
      if (result.removedNetworks[net].length)
        this.emit({
          t: 'networksChanged',
          net,
          added: [],
          removed: result.removedNetworks[net],
        });
    this.emit({ t: 'fundsChanged', money: s.money });
    if (s.buildings.length || removedBuildings.size) this.refreshPopulation();
    else this.refreshPower();
    return { ok: true, refund: result.refund, cost: result.cost };
  }

  /** Apply free zoning atomically; the renderer receives only acknowledged block copies. */
  zone(cells: ZoneCell[], zone: ZoneType | null): Omit<Result, 't' | 'reqId'> {
    if (this.gameOver) return { ok: false, reason: 'err.gameOver' };
    const result = paintZones(
      { ...this.state, mode: this.state.settings.mode },
      cells,
      zone,
    );
    if (result.reason) return { ok: false, reason: result.reason };
    const changed = new Map(result.blocks.map((b) => [b.id, b]));
    this.state.zoneBlocks = this.state.zoneBlocks.map(
      (b) => changed.get(b.id) ?? b,
    );
    if (result.blocks.length)
      this.emit({
        t: 'zonesChanged',
        blocks: structuredClone(result.blocks),
        removed: [],
      });
    const updated = this.growth.zoningChanged(this.state);
    if (updated.length)
      this.emit({
        t: 'buildingsChanged',
        added: [],
        removed: [],
        updated: structuredClone(updated),
      });
    return { ok: true, cost: 0 };
  }

  private refreshPopulation(): void {
    const updated = updatePopulation(this.state);
    if (updated.length)
      this.emit({
        t: 'buildingsChanged',
        added: [],
        removed: [],
        updated: structuredClone(updated),
      });
    this.refreshPower();
  }

  /** Advance exactly one simulation step, unless paused. */
  tick(): void {
    if (this.state.clock.speed === 0 || this.gameOver) return;
    const dayCompleted = this.time.tick(this.state.clock);
    const growth = this.growth.tick(this.state);
    if (growth.blocks.length)
      this.emit({
        t: 'zonesChanged',
        blocks: structuredClone(growth.blocks),
        removed: [],
        occupancyOnly: true,
      });
    if (growth.added.length || growth.updated.length || growth.removed.length)
      this.emit({
        t: 'buildingsChanged',
        added: structuredClone(growth.added),
        updated: structuredClone(growth.updated),
        removed: growth.removed,
      });
    if (
      growth.removed.length ||
      growth.updated.some((b) => b.state === 'active')
    )
      this.refreshPopulation();
    if (!dayCompleted) return;
    this.state.stats.day = this.state.clock.day;
    this.state.stats.money = this.state.money;
    const stats = structuredClone(this.state.stats);
    this.state.statsHistory.push(stats);
    this.emit({ t: 'stats', stats: structuredClone(stats) });
  }

  /** Preserve fractional progress when pausing / changing speed. */
  setSpeed(speed: SimSpeed): void {
    if (![0, 1, 2, 4].includes(speed)) throw new RangeError('Invalid speed');
    this.state.clock.speed = this.gameOver ? 0 : speed;
  }

  /** Consume elapsed milliseconds with a bounded catch-up window; return executed steps. */
  advance(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
      throw new RangeError('Invalid elapsed time');
    if (this.state.clock.speed === 0) return 0;
    this.accumulatedMs +=
      Math.min(elapsedMs, SIM_RUNTIME.maxElapsedMs) * this.state.clock.speed;
    let steps = 0;
    while (this.accumulatedMs >= tickMs) {
      this.accumulatedMs -= tickMs;
      this.tick();
      steps++;
    }
    return steps;
  }
}
