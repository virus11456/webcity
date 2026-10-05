import { TIME, type SimSpeed } from '../data/config';
import { SIM_RUNTIME } from '../data/simRuntime';
import type { CitySettings, SimClock, WorldSnapshot } from '../world/snapshot';
import { createState, type SimState } from './state';

const tickMs = (TIME.secondsPerDay[1] * 1000) / TIME.ticksPerDay;

/** Deterministic simulation; no browser, wall clock or worker required. */
export class Simulation {
  private readonly state: SimState;
  private accumulatedMs = 0;

  constructor(settings: CitySettings) {
    this.state = createState(settings);
  }

  /** Copy just the clock, safe for subscribers to retain. */
  readClock(): SimClock {
    return { ...this.state.clock };
  }

  /** Copy all arrays; callers cannot mutate the authoritative city. */
  snapshot(): WorldSnapshot {
    return structuredClone(this.state);
  }

  /** Advance exactly one simulation step, unless paused. */
  tick(): void {
    const c = this.state.clock;
    if (c.speed === 0) return;
    c.ticks++;
    c.tickInDay = c.ticks % TIME.ticksPerDay;
    c.day = Math.floor(c.ticks / TIME.ticksPerDay);
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
