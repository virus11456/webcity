import { garbageState } from './garbageCity';
import { MILESTONES } from '../../src/data/milestones';
export function uniqueState() {
  const { s } = garbageState();
  s.settings.mode = 'normal';
  s.settings.cityName = '地標測試市';
  s.clock.speed = 0;
  s.money = 2000000;
  s.unlocked = MILESTONES.map((m) => m.id);
  s.buildings[0]!.kind = 'service';
  s.buildings[0]!.defId = 'police_station';
  delete s.buildings[1]!.garbage;
  return s;
}
