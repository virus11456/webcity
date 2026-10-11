import { deathcareState } from './deathcareCity';
import { initialHousing, buildingCapacity } from '../../src/world/population';
export function milestoneState() {
  const { s } = deathcareState();
  s.settings.mode = 'normal';
  s.settings.cityName = '里程碑測試市';
  s.unlocked = [0];
  s.clock.speed = 0;
  s.money = 70000;
  const base = s.buildings[1]!;
  s.buildings = Array.from({ length: 10 }, (_, i) => {
    const b = {
      ...structuredClone(base),
      id: 10001 + i,
      defId: 'RH',
      level: 5,
      lotW: 4,
      lotD: 4,
      pos: { x: -360 + i * 72, z: 9 },
      residents: 51,
      households: 11,
    };
    delete b.bodies;
    b.housing = initialHousing(b, buildingCapacity(b));
    return b;
  });
  s.nextId = 10100;
  return s;
}
