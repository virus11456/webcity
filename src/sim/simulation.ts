import { TransitSystem } from './systems/transit';
import { busLineViews } from '../world/transit';
import { TRANSIT } from '../data/transit';
import { updateHappiness } from './systems/happiness';
import { updateLevels } from './systems/levels';
import {
  FieldsSystem,
  updateLandValue,
  environmentSummary,
} from './systems/fields';
import { previewTrees } from '../world/parks';
import { PARKS } from '../data/parks';
import { updateEducationSummary } from './systems/education';
import { updateHealth } from './systems/health';
import { FireSystem } from './systems/fire';
import { updateCrime } from './systems/police';
import { ServiceSystem } from './systems/services';
import { serviceDefinition, previewService } from '../world/services';
import { CargoSystem } from './systems/cargo';
import { TrafficSystem } from './systems/traffic';
import { RoutePlanner } from './systems/routePlanner';
import { ScheduleSystem } from './systems/schedules';
import { LaneGraph } from '../world/laneGraph';
import { INTERSECTIONS } from '../data/intersections';
import { previewRoadUpgrade, upgradedPayment } from '../world/roadUpgrade';
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
import { ROADS, ROAD_RULES, type RoadTypeId } from '../data/roads';
import { projectCurve } from '../world/roadCurves';
import { BULLDOZE } from '../data/bulldoze';
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
  readonly laneGraph = new LaneGraph();
  readonly transit: TransitSystem;
  readonly schedules: ScheduleSystem;
  readonly routePlanner: RoutePlanner;
  readonly traffic: TrafficSystem;
  readonly services: ServiceSystem;
  readonly cargo: CargoSystem;
  readonly fire: FireSystem;
  readonly fields: FieldsSystem;
  private emit(event: SimEvent): void {
    if (event.t === 'roadsChanged') {
      this.laneGraph.sync(this.state.nodes, this.state.segments);
      this.traffic?.networkChanged();
      this.transit?.networkChanged();
      this.cargo?.networkChanged();
      this.services?.networkChanged();
      this.fire?.networkChanged();
    }
    if (
      event.t === 'buildingsChanged' &&
      this.transit &&
      this.state.transitLines.length > 0
    ) {
      this.transit.tick();
      this.sink({ t: 'transit', lines: busLineViews(this.state.transitLines) });
    }
    this.sink(event);
  }
  private accumulatedMs = 0;
  private readonly time = new TimeSystem();
  private readonly growth = new GrowthSystem();

  constructor(
    settings: CitySettings,
    private readonly sink: (event: SimEvent) => void = () => {},
    restored?: WorldSnapshot,
  ) {
    this.state = createState(settings);
    if (restored) {
      const copy = structuredClone(restored),
        terrain = this.state.terrain;
      Object.assign(terrain, copy.terrain);
      Object.assign(this.state, copy, { terrain });
    }
    updatePopulation(this.state);
    this.schedules = new ScheduleSystem(this.state);
    this.routePlanner = new RoutePlanner(
      this.state,
      this.laneGraph,
      this.schedules,
    );
    this.laneGraph.sync(this.state.nodes, this.state.segments);
    this.traffic = new TrafficSystem(
      this.state,
      this.laneGraph,
      this.routePlanner,
      this.schedules,
      this.state.traffic,
    );
    this.transit = new TransitSystem(
      this.state,
      this.routePlanner,
      this.traffic,
      this.schedules,
    );
    this.traffic.sampleFlow();
    this.fields = new FieldsSystem(this.state, () =>
      this.traffic.roadVehicleCounts(),
    );
    this.cargo = new CargoSystem(
      this.state,
      this.laneGraph,
      this.routePlanner,
      this.traffic,
    );
    this.services = new ServiceSystem(this.state);
    this.services.update();
    updateHealth(this.state);
    updateEducationSummary(this.state);
    if (restored?.environmentVersion === 1) environmentSummary(this.state);
    else updateLandValue(this.state);
    this.state.environmentVersion = 1;
    updateHappiness(this.state);
    updateLevels(this.state);
    this.fire = new FireSystem(this.state, this.routePlanner, this.traffic);
    this.time.onDay(() => {
      const priorHappiness = updateHappiness(this.state);
      const population = updatePopulation(this.state, true);
      const power = [...updatePower(this.state), ...updateWater(this.state)];
      this.cargo.daily();
      const servicePatches = [
        ...this.services.update(),
        ...updateEducationSummary(this.state),
        ...updateLandValue(this.state),
      ];
      this.fire.daily();
      const firePatches = this.fire.patches();
      const crimePatches = updateCrime(this.state);
      const healthPatches = updateHealth(this.state, true);
      const problems = updateProblems(this.state);
      const reconciliation =
        firePatches.length > 0 ||
        problems.some((p) => p.state === 'abandoned' && p.stateTimer === 0)
          ? [
              ...updatePopulation(this.state),
              ...updatePower(this.state),
              ...updateWater(this.state),
              ...updateProblems(this.state),
              ...this.services.update(),
              ...updateHealth(this.state),
              ...updateEducationSummary(this.state),
              ...updateLandValue(this.state),
            ]
          : [];
      const levels = updateLevels(this.state, true);
      if (
        levels.some((p) => p.development?.changedDay === this.state.clock.day)
      )
        levels.push(
          ...updatePopulation(this.state),
          ...updatePower(this.state),
          ...updateWater(this.state),
          ...updateLevels(this.state),
        );
      const happiness = updateHappiness(this.state);
      updateDemand(this.state);
      const updates = new Map<number, BuildingPatch>();
      for (const p of [
        ...priorHappiness,
        ...population,
        ...servicePatches,
        ...crimePatches,
        ...healthPatches,
        ...firePatches,
        ...power,
        ...this.cargo.patches(),
        ...problems,
        ...reconciliation,
        ...levels,
        ...happiness,
      ])
        updates.set(p.id, { ...updates.get(p.id), ...p });
      const updated = [...updates.values()];
      if (updated.some((p) => p.landValue !== undefined)) {
        this.emit({
          t: 'fields',
          which: 'landValue',
          data: this.state.fields.landValue.slice(),
        });
        this.emit({
          t: 'fields',
          which: 'coverage.parks',
          data: this.state.fields.coverage.parks.slice(),
        });
      }
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
    if (kind === 'vehicle') {
      const value = this.traffic.inspect(id);
      if (!value) return null;
      const position = (id: number) => {
        const p = s.buildings.find((b) => b.id === id)?.pos;
        return p ? { ...p } : undefined;
      };
      const shipment =
        value.citizenId < 0
          ? s.cargo.shipments.find((j) => j.id === -value.citizenId)
          : undefined;
      const busLine =
        value.purpose === 8
          ? s.transitLines.find((l) =>
              l.buses.some((b) => b.mission === -value.citizenId),
            )
          : undefined;
      const bus = busLine?.buses.find((b) => b.mission === -value.citizenId);
      return {
        kind,
        value: {
          ...value,
          bus:
            busLine && bus
              ? {
                  line: busLine.id,
                  passengers: busLine.riders.filter(
                    (p) => p.stage === 'riding' && p.bus === bus.id,
                  ).length,
                }
              : undefined,
          originPos: position(value.originId ?? 0),
          cargo: shipment
            ? { units: shipment.units, kind: shipment.kind }
            : undefined,
          homePos: position(value.homeId),
          workPos: position(value.workId),
          destinationPos: position(value.destinationId),
        },
      };
    }
    if (kind === 'building') {
      const value = s.buildings.find((b) => b.id === id);
      return value ? { kind, value: structuredClone(value) } : null;
    }
    if (kind === 'segment') {
      const value = s.segments.find((b) => b.id === id);
      return value
        ? {
            kind,
            value: structuredClone({
              ...value,
              traffic: this.traffic.roadFlow.get(id),
            }),
          }
        : null;
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
      if (command.t === 'setTax') this.refreshPower();
      if (command.t === 'setBudget') {
        if (command.dept === 'education') this.refreshPopulation();
        else this.refreshPower();
      }
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
    this.cargo.reconcile();
    this.fire?.reconcile();
    const patches = [
      ...this.services.update(),
      ...this.cargo.patches(),
      ...updatePower(this.state),
      ...updateWater(this.state),
      ...updateHealth(this.state),
      ...updateEducationSummary(this.state),
      ...updateLandValue(this.state),
      ...updateProblems(this.state),
    ];
    if (patches.some((p) => p.state === 'abandoned' && p.stateTimer === 0))
      patches.push(
        ...updatePopulation(this.state),
        ...updatePower(this.state),
        ...updateWater(this.state),
        ...updateProblems(this.state),
        ...this.services.update(),
        ...updateHealth(this.state),
        ...updateEducationSummary(this.state),
        ...updateLandValue(this.state),
      );
    patches.push(...updateHappiness(this.state), ...updateLevels(this.state));
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
      t: 'fields',
      which: 'landValue',
      data: this.state.fields.landValue.slice(),
    });
    this.emit({
      t: 'fields',
      which: 'coverage.parks',
      data: this.state.fields.coverage.parks.slice(),
    });
    this.emit({
      t: 'stats',
      stats: structuredClone(this.state.stats),
      transient: true,
    });
  }
  plantTrees(points: Vec2[]): Omit<Result, 't' | 'reqId'> {
    if (this.gameOver || !points.length || points.length > PARKS.maxBrushTrees)
      return { ok: false, reason: 'err.invalidCommand' };
    const preview = previewTrees(this.powerWorld(), points);
    if (!preview.valid)
      return { ok: false, reason: preview.reason ?? 'err.invalidCommand' };
    const charge = chargeConstruction(this.state, preview.cost);
    if (!charge.ok) return charge;
    const s = this.state;
    const added: Building[] = preview.trees!.map((pos) => {
      const id = s.nextId++;
      return {
        id,
        kind: 'park',
        defId: 'tree',
        level: 1,
        pos,
        rotation: 0,
        lotW: 1,
        lotD: 1,
        seed: (s.seed + id) >>> 0,
        state: 'active',
        stateTimer: 0,
        flags: 0,
        households: 0,
        residents: 0,
        jobs: 0,
        workers: 0,
        builtDay: s.clock.day,
        paidCost: preview.cost / preview.trees!.length,
        problemTimers: Object.fromEntries(
          Object.keys(PROBLEMS).map((p) => [p, 0]),
        ) as Building['problemTimers'],
      };
    });
    s.buildings = [...s.buildings, ...added];
    const zones = rebuildZoneGrid({ ...s, heights: s.terrain.heights });
    s.zoneBlocks = zones.blocks;
    s.segments = zones.segments;
    s.nextId = zones.nextId;
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
    this.emit({
      t: 'buildingsChanged',
      added: structuredClone(added),
      updated: [],
      removed: [],
    });
    this.emit({ t: 'fundsChanged', money: s.money });
    this.refreshPopulation();
    return { ok: true, cost: preview.cost };
  }
  place(
    defId: string,
    pos: Vec2,
    rotation: number,
  ): Omit<Result, 't' | 'reqId'> {
    if (defId === 'tree')
      return Number.isFinite(rotation)
        ? this.plantTrees([pos])
        : { ok: false, reason: 'err.invalidCommand' };
    const d =
        serviceDefinition(defId) ??
        waterDefinition(defId) ??
        plantDefinition(defId),
      preview = waterDefinition(defId)
        ? previewWaterFacility(this.powerWorld(), defId, pos, rotation)
        : serviceDefinition(defId)
          ? previewService(
              this.powerWorld(),
              defId,
              pos,
              rotation,
              this.state.budgets[serviceDefinition(defId)!.service ?? 'parks'],
            )
          : previewPlant(this.powerWorld(), defId, pos, rotation);
    if (!preview.valid || !d || !d.footprintCells)
      return { ok: false, reason: preview.reason ?? 'err.invalidCommand' };
    const charge = chargeConstruction(this.state, preview.cost);
    if (!charge.ok) return charge;
    const s = this.state,
      id = s.nextId++;
    const b: Building = {
      id,
      kind: d.kind,
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
    if (serviceDefinition(b.defId)?.service === 'education')
      this.refreshPopulation();
    else this.refreshPower();
    return { ok: true, cost: preview.cost };
  }
  setBuildingEnabled(
    id: number,
    enabled: boolean,
  ): Omit<Result, 't' | 'reqId'> {
    if (this.gameOver) return { ok: false, reason: 'err.gameOver' };
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b || !serviceDefinition(b.defId) || typeof enabled !== 'boolean')
      return { ok: false, reason: 'err.invalidCommand' };
    b.enabled = enabled;
    this.emit({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: [{ id, enabled }],
    });
    if (serviceDefinition(b.defId)?.service === 'education')
      this.refreshPopulation();
    else this.refreshPower();
    this.emit({ t: 'economy', finance: financeView(this.state) });
    return { ok: true, cost: 0 };
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
  busCommand(
    command:
      | { t: 'createBusLine'; stops: Vec2[] }
      | { t: 'setBusVehicles'; id: number; vehicles: number }
      | { t: 'deleteBusLine'; id: number },
  ): Omit<Result, 't' | 'reqId'> {
    const result =
      command.t === 'createBusLine'
        ? this.transit.create(command.stops)
        : command.t === 'setBusVehicles'
          ? this.transit.setVehicles(command.id, command.vehicles)
          : this.transit.delete(command.id);
    if (result.ok)
      this.emit({ t: 'transit', lines: busLineViews(this.state.transitLines) });
    return result;
  }
  snapshot(): WorldSnapshot {
    this.cargo.reconcile();
    this.fire?.reconcile();
    this.transit.tick();
    return structuredClone({ ...this.state, traffic: this.traffic.snapshot() });
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
        elevated: p.draft.elevated,
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

  setIntersection(
    id: number,
    control: 'none' | 'lights' | 'stop',
    banLeft: boolean,
  ): Omit<Result, 't' | 'reqId'> {
    const s = this.state;
    if (this.gameOver) return { ok: false, reason: 'err.gameOver' };
    if (
      !GAME_MODES[s.settings.mode].allUnlocked &&
      !s.unlocked.includes(INTERSECTIONS.unlock)
    )
      return { ok: false, reason: 'err.locked' };
    const node = s.nodes.find((n) => n.id === id);
    if (
      !node ||
      node.segments.length < 3 ||
      !['none', 'lights', 'stop'].includes(control) ||
      typeof banLeft !== 'boolean'
    )
      return { ok: false, reason: 'err.invalidCommand' };
    node.control = control;
    node.banLeft = banLeft;
    node.manualControl = true;
    this.emit({
      t: 'roadsChanged',
      added: [],
      removed: [],
      nodes: [structuredClone(node)],
      removedNodes: [],
    });
    return { ok: true, cost: 0 };
  }

  /** Replace one road after a fresh authoritative quote; unaffected buildings retain their IDs. */
  upgradeRoad(id: number, type: RoadTypeId): Omit<Result, 't' | 'reqId'> {
    if (this.gameOver) return { ok: false, reason: 'err.gameOver' };
    const s = this.state,
      old = s.segments.find((r) => r.id === id),
      quote = previewRoadUpgrade(
        { ...s, heights: s.terrain.heights, mode: s.settings.mode },
        id,
        type,
      );
    if (
      !quote.result.canBuild ||
      !quote.result.preview ||
      !quote.segment ||
      !old
    )
      return { ok: false, reason: quote.result.reason ?? 'err.invalidCommand' };
    const cost = quote.result.preview.cost,
      charge = chargeConstruction(s, cost);
    if (!charge.ok) return charge;
    const access = roadAccess(s.nodes, s.segments),
      connected = new Set(s.buildings.filter(access).map((b) => b.id));
    const removed = new Set(
        quote.removedBuildingIndices.map((i) => s.buildings[i]!.id),
      ),
      segment = {
        ...quote.segment,
        ...upgradedPayment(old, cost, s.clock.day),
      };
    s.segments = s.segments.map((r) => (r.id === id ? segment : r));
    const oldStart = s.nodes.find((n) => n.id === old.start)!.pos,
      oldEnd = s.nodes.find((n) => n.id === old.end)!.pos;
    const setbacks: Building[] = [];
    for (const b of s.buildings) {
      const gap = projectCurve(b.pos, [
        oldStart,
        old.c1,
        old.c2,
        oldEnd,
      ]).distance;
      if (
        !removed.has(b.id) &&
        gap <=
          ROADS[old.type].widthM / 2 +
            (b.frontageSetbackM ?? 0) +
            BULLDOZE.frontageToleranceM
      ) {
        b.frontageSetbackM = Math.min(
          Math.max(...Object.values(ROADS).map((r) => r.widthM)) / 2,
          Math.max(
            0,
            (b.frontageSetbackM ?? 0) +
              (ROADS[old.type].widthM - ROADS[type].widthM) / 2,
          ),
        );
        setbacks.push(b);
      }
    }
    s.buildings = s.buildings.filter((b) => !removed.has(b.id));
    for (const n of s.nodes) {
      const wide = n.segments.filter((id) => {
        const r = s.segments.find((s) => s.id === id)!;
        return (
          ROADS[r.type].lanesForward + ROADS[r.type].lanesBackward >=
          ROAD_RULES.signalMinLanes
        );
      }).length;
      if (!n.manualControl)
        n.control = wide >= ROAD_RULES.signalMinWideArms ? 'lights' : 'none';
    }
    // A pure direction reversal has identical physical frontage and zoning.
    const reversal = old.type === type && old.start === segment.end;
    const zones = reversal
      ? {
          blocks: s.zoneBlocks,
          segments: s.segments,
          removed: [],
          nextId: s.nextId,
        }
      : rebuildZoneGrid({
          ...s,
          heights: s.terrain.heights,
          zoneBlocks: s.zoneBlocks.map((b) => ({
            ...b,
            buildingAt: Int32Array.from(b.buildingAt, (id) =>
              removed.has(id) ? -1 : id,
            ),
          })),
        });
    s.segments = zones.segments;
    s.zoneBlocks = zones.blocks;
    s.nextId = zones.nextId;
    const anchors = new Map<number, { zoneBlock: number; blockCell: number }>();
    for (const block of s.zoneBlocks)
      block.buildingAt.forEach((id, i) => {
        if (id !== -1 && !anchors.has(id))
          anchors.set(id, { zoneBlock: block.id, blockCell: i });
      });
    const updated: Building[] = [...setbacks];
    for (const b of s.buildings)
      if (b.kind === 'zoned') {
        const a = anchors.get(b.id);
        if (b.zoneBlock !== a?.zoneBlock || b.blockCell !== a?.blockCell) {
          b.zoneBlock = a?.zoneBlock;
          b.blockCell = a?.blockCell;
          updated.push(b);
        }
      }
    const terrain = roadBedPatch(s.terrain.heights, s.nodes, s.segments);
    terrain.indices.forEach((i, j) => {
      s.terrain.heights[i] = terrain.heights[j]!;
    });
    if (terrain.indices.length) s.terrain.revision++;
    this.emit({
      t: 'roadsChanged',
      added: structuredClone(s.segments),
      removed: [],
      nodes: structuredClone(s.nodes),
      removedNodes: [],
      terrain: { ...terrain, revision: s.terrain.revision },
    });
    this.emit({
      t: 'zonesChanged',
      blocks: structuredClone(s.zoneBlocks),
      removed: zones.removed,
    });
    const changed = [
      ...new Map(
        [...updated, ...refreshRoadAccess(s, connected)].map((b) => [b.id, b]),
      ).values(),
    ];
    this.emit({
      t: 'buildingsChanged',
      added: [],
      removed: [...removed],
      updated: structuredClone(changed),
    });
    this.emit({ t: 'fundsChanged', money: s.money });
    this.refreshPopulation();
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
    this.schedules.tick();
    this.routePlanner.tick();
    const flowRevision = this.traffic.flowRevision;
    this.traffic.step(tickMs / 1000, (this.state.clock.ticks * tickMs) / 1000);
    if (flowRevision !== this.traffic.flowRevision)
      this.emit({
        t: 'roadTraffic',
        roads: [...this.traffic.roadFlow.values()].map((v) => ({ ...v })),
      });
    const environment = this.fields.step();
    if (environment) {
      for (const which of environment.fields)
        this.emit({
          t: 'fields',
          which,
          data: this.state.fields[which].slice(),
        });
      if (environment.fields.includes('landValue'))
        this.emit({
          t: 'fields',
          which: 'coverage.parks',
          data: this.state.fields.coverage.parks.slice(),
        });
      if (environment.buildings.length)
        this.emit({
          t: 'buildingsChanged',
          added: [],
          removed: [],
          updated: environment.buildings,
        });
    }
    this.fire.tick();
    this.cargo.tick();
    this.transit.tick();
    if (
      this.state.transitLines.length > 0 &&
      this.state.clock.ticks % TRANSIT.refreshTicks === 0
    )
      this.emit({ t: 'transit', lines: busLineViews(this.state.transitLines) });
    const cargoPatches = [...this.fire.patches(), ...this.cargo.patches()];
    if (cargoPatches.length)
      this.emit({
        t: 'buildingsChanged',
        added: [],
        removed: [],
        updated: cargoPatches,
      });
    if (cargoPatches.some((p) => p.fire !== undefined)) this.refreshPower();
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
