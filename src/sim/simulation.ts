import { meshHeightAt } from '../world/heightField';
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
import type { CitySettings, SimClock, WorldSnapshot } from '../world/snapshot';
import { createState, type SimState } from './state';

const tickMs = (TIME.secondsPerDay[1] * 1000) / TIME.ticksPerDay;

/** Deterministic simulation; no browser, wall clock or worker required. */
export class Simulation {
  private readonly state: SimState;
  private accumulatedMs = 0;
  private readonly time = new TimeSystem();

  constructor(
    settings: CitySettings,
    private readonly emit: (event: SimEvent) => void = () => {},
  ) {
    this.state = createState(settings);
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
    const change = RoadGraph.previewRoad(
      s,
      {
        type,
        start: p.start.pos,
        end: p.end.pos,
        startHeight: p.start.height,
        endHeight: p.end.height,
        builtDay: s.clock.day,
      },
      (point) => meshHeightAt(s.terrain.heights, point.x, point.z),
    );
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
    const cost = GAME_MODES[s.settings.mode].unlimitedMoney ? 0 : p.cost;
    s.money -= cost;
    s.stats.money = s.money;
    this.emit({ t: 'roadsChanged', ...structuredClone(change) });
    this.emit({ t: 'fundsChanged', money: s.money });
    return { ok: true, cost };
  }

  /** Advance exactly one simulation step, unless paused. */
  tick(): void {
    if (!this.time.tick(this.state.clock)) return;
    this.state.stats.day = this.state.clock.day;
    this.state.stats.money = this.state.money;
    const stats = structuredClone(this.state.stats);
    this.state.statsHistory.push(stats);
    this.emit({ t: 'stats', stats: structuredClone(stats) });
  }

  /** Preserve fractional progress when pausing / changing speed. */
  setSpeed(speed: SimSpeed): void {
    if (![0, 1, 2, 4].includes(speed)) throw new RangeError('Invalid speed');
    this.state.clock.speed = speed;
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
