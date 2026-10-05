import { EventBus, type Unsubscribe } from '../../core/events';
import { TIME } from '../../data/config';
import { dateForDay } from '../../world/calendar';
import type { SimClock } from '../../world/snapshot';

export interface DayBoundary {
  readonly day: number;
  readonly date: string;
  readonly completedWeeks: number;
}

/** Fixed-step calendar with daily hooks before weekly hooks at the same boundary. */
export class TimeSystem {
  private readonly events = new EventBus<{
    day: DayBoundary;
    week: DayBoundary;
  }>();

  /** Subscribe once per completed game day; day zero never fires a hook. */
  onDay(listener: (boundary: DayBoundary) => void): Unsubscribe {
    return this.events.on('day', listener);
  }

  /** Subscribe at completed days 7, 14, ...; return a removable subscription. */
  onWeek(listener: (boundary: DayBoundary) => void): Unsubscribe {
    return this.events.on('week', listener);
  }

  /** Advance one tick, run boundary hooks, and report whether a day completed. */
  tick(clock: SimClock): boolean {
    if (clock.speed === 0) return false;
    clock.ticks++;
    clock.tickInDay = clock.ticks % TIME.ticksPerDay;
    clock.day = Math.floor(clock.ticks / TIME.ticksPerDay);
    if (clock.tickInDay !== 0) return false;
    const boundary = Object.freeze({
      day: clock.day,
      date: dateForDay(clock.day),
      completedWeeks: Math.floor(clock.day / TIME.fiscalPeriodDays),
    });
    this.events.emit('day', boundary);
    if (clock.day % TIME.fiscalPeriodDays === 0)
      this.events.emit('week', boundary);
    return true;
  }
}
