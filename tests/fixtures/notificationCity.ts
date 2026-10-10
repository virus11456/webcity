import { levelsState } from './levelsCity';
import { serialize } from '../../src/save/serializer';
/** Paused saved city with three real conditions; no injected UI notifications. */
export async function notificationCity() {
  const s = levelsState(),
    home = s.buildings[0]!;
  home.flags = 0;
  home.fire = { burning: true, damage: 0, startedDay: s.clock.day };
  s.settings.cityName = '城市通知';
  return {
    settings: s.settings,
    population: s.stats.population,
    day: s.clock.day,
    data: Array.from(new Uint8Array(await serialize(s))),
  };
}
