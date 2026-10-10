import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { initialHousing, buildingCapacity } from '../../src/world/population';
import { updatePopulation } from '../../src/sim/systems/population';
import { JourneyStatus, JourneyPurpose } from '../../src/world/schedules';
export const busStops = [
  { x: -180, z: -120 },
  { x: 180, z: -120 },
];
export function busState() {
  const s = createState({
    seed: 401,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '公車測試市',
  });
  s.terrain.heights.fill(60);
  const g = new RoadGraph();
  const points = [
    { x: -240, z: -120 },
    { x: 240, z: -120 },
    { x: 240, z: 120 },
    { x: -240, z: 120 },
  ];
  for (let i = 0; i < 4; i++)
    g.addRoad({
      start: points[i]!,
      end: points[(i + 1) % 4]!,
      type: 'road_small',
      builtDay: 0,
      startHeight: 60,
      endHeight: 60,
    });
  Object.assign(s, g.snapshot());
  s.nextId = 100;
  const model = structuredClone(districtFixture(1)[0]!);
  const home = {
    ...model,
    id: s.nextId++,
    defId: 'RH',
    pos: { x: -180, z: -100 },
    state: 'active' as const,
    level: 5,
    residents: 80,
    households: 30,
    lotW: 4,
    lotD: 4,
    frontageSetbackM: 16,
  };
  home.housing = initialHousing(home, buildingCapacity(home));
  const work = {
    ...model,
    id: s.nextId++,
    defId: 'I',
    pos: { x: 180, z: -100 },
    state: 'active' as const,
    level: 3,
    lotW: 4,
    lotD: 4,
    residents: 0,
    households: 0,
    frontageSetbackM: 16,
  };
  const depot = {
    ...model,
    id: s.nextId++,
    kind: 'service' as const,
    defId: 'bus_depot',
    pos: { x: -220, z: -104 },
    state: 'active' as const,
    lotW: 4,
    lotD: 4,
    residents: 0,
    households: 0,
    frontageSetbackM: 16,
    enabled: true,
  };
  s.buildings = [home, work, depot];
  updatePopulation(s);
  const c = s.citizens;
  for (let i = 0; i < c.count; i++) {
    if (!c.workId[i]) continue;
    c.locationId[i] = home.id;
    c.tripOriginId[i] = home.id;
    c.destinationId[i] = work.id;
    c.tripPurpose[i] = JourneyPurpose.work;
    c.tripStatus[i] = JourneyStatus.pending;
    c.travelMode[i] = 1;
    c.tripStartTick[i] = 0;
  }
  return s;
}
