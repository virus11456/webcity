import { WEATHER as W } from '../data/weather';
export interface WeatherSample {
  kind: 'clear' | 'rain' | 'fog' | 'clouds';
  rain: number;
  fog: number;
  cloud: number;
}
const smooth = (v: number) => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};
/** Stateless hash: sampling/reloading cannot consume simulation randomness. Reuse out per frame. */
export function weatherAt(
  seed: number,
  ticks: number,
  out: WeatherSample = { kind: 'clear', rain: 0, fog: 0, cloud: 0 },
): WeatherSample {
  const t = Number.isFinite(ticks) ? Math.max(0, ticks) : 0,
    epoch = Math.floor(t / W.periodTicks),
    phase = t / W.periodTicks - epoch;
  let n = (seed | 0) ^ W.seedSalt ^ Math.imul(epoch, 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  const random = ((n ^ (n >>> 16)) >>> 0) / 0x100000000;
  out.kind =
    random < W.clearThreshold
      ? 'clear'
      : random < W.rainThreshold
        ? 'rain'
        : random < W.fogThreshold
          ? 'fog'
          : 'clouds';
  const strength =
    smooth(phase / W.fadeFraction) * smooth((1 - phase) / W.fadeFraction);
  out.rain = out.kind === 'rain' ? strength : 0;
  out.fog =
    (out.kind === 'fog' ? 1 : out.kind === 'rain' ? W.rainFog : 0) * strength;
  out.cloud =
    (out.kind === 'rain'
      ? 1
      : out.kind === 'clouds'
        ? W.cloudyStrength
        : out.kind === 'fog'
          ? W.fogCloud
          : 0) * strength;
  return out;
}
