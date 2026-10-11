import { busState } from './busCity';
export function metroState() {
  const s = busState();
  s.settings.cityName = '地鐵測試市';
  const base = s.buildings[2]!;
  s.buildings = s.buildings.slice(0, 2);
  for (const x of [-140, 140])
    s.buildings.push({
      ...structuredClone(base),
      id: x < 0 ? base.id : s.nextId++,
      defId: 'metro_station',
      pos: { x, z: -104 },
    });
  return s;
}
export const metroStops = [
  { x: -140, z: -104 },
  { x: 140, z: -104 },
];
