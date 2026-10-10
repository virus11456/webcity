import { Color } from 'three';
import { DAY_NIGHT as D } from '../data/dayNight';
import { DAY_NIGHT_PALETTE as P } from '../data/palette';
import { TIME } from '../data/config';
import { mobilityHour } from '../world/schedules';
import type { SimClock } from '../world/snapshot';

const colorKeys = ['sun', 'zenith', 'horizon'] as const;

/** Reused colors and a bounded interpolation of the last acknowledged Worker clock. */
export class DayNight {
  readonly hour = { value: 12 };
  readonly sun = new Color();
  readonly zenith = new Color();
  readonly horizon = new Color();
  sunIntensity = 3;
  ambientIntensity = 1.2;
  night = 0;
  enabled = true;
  private ticks = 0;
  private speed = 0;
  private elapsed = 0;
  private readonly colors = {
    sun: P.sun.map((c) => new Color(c)),
    zenith: P.zenith.map((c) => new Color(c)),
    horizon: P.horizon.map((c) => new Color(c)),
  };
  constructor() {
    this.sample(12);
  }
  accept(clock: Readonly<SimClock>): void {
    this.ticks = clock.ticks;
    this.speed = clock.speed;
    this.elapsed = 0;
  }
  update(seconds: number): void {
    const step = TIME.secondsPerDay[1] / TIME.ticksPerDay;
    this.elapsed = Math.min(
      step,
      this.elapsed + Math.max(0, seconds) * this.speed,
    );
    this.sample(
      this.enabled
        ? mobilityHour(this.ticks + (this.speed ? this.elapsed / step : 0))
        : 12,
    );
  }
  /** Deterministic visual sampling also used by the art test fixture. */
  sample(hour: number): void {
    const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
    this.hour.value = h;
    let index = 0;
    while (index < D.hours.length - 2 && h >= D.hours[index + 1]!) index++;
    const t = (h - D.hours[index]!) / (D.hours[index + 1]! - D.hours[index]!);
    this.sunIntensity = D.sun[index]! + (D.sun[index + 1]! - D.sun[index]!) * t;
    this.ambientIntensity =
      D.ambient[index]! + (D.ambient[index + 1]! - D.ambient[index]!) * t;
    for (const key of colorKeys)
      this[key].lerpColors(
        this.colors[key][index]!,
        this.colors[key][index + 1]!,
        t,
      );
    this.night = h < 6 ? Math.min(1, 6 - h) : Math.max(0, Math.min(1, h - 18));
  }
}
