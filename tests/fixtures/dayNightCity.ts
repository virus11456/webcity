import { trafficCity } from './trafficCity';
import { deserialize, serialize } from '../../src/save/serializer';
import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
/** Controlled paused visual fixtures; traffic retains real independent routes. */
export async function dayNightCity(hour: number) {
  const base = await trafficCity(64);
  const snapshot = await deserialize(new Uint8Array(base.data).buffer);
  const ticks = hourTicks(hour);
  snapshot.clock = {
    ticks,
    day: Math.floor(ticks / TIME.ticksPerDay),
    tickInDay: ticks % TIME.ticksPerDay,
    speed: 0,
  };
  return {
    ...base,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
    day: snapshot.clock.day,
  };
}
