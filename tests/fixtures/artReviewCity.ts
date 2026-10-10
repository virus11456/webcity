import { updatePopulation } from '../../src/sim/systems/population';
import { BUILDINGS, UTILITY_RULES } from '../../src/data/buildings';
import { updateWater } from '../../src/sim/systems/water';
import { updatePower } from '../../src/sim/systems/power';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { RoadGraph } from '../../src/world/roadGraph';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { catalogModels } from '../../src/world/modelCatalog';
import { serialize } from '../../src/save/serializer';
import { hourTicks } from '../../src/world/schedules';
import { TIME } from '../../src/data/config';
/** Authored visual-review save, loaded through normal storage; not a claim of player progression. */
export async function artReviewCity(hour = 12) {
  const s = createState({
    seed: 20261011,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '晴川市 · 美術展示存檔',
  });
  s.terrain.heights.fill(60);
  const roads = new RoadGraph();
  const road = (ax: number, az: number, bx: number, bz: number) =>
    roads.addRoad({
      start: { x: ax, z: az },
      end: { x: bx, z: bz },
      type: 'road_small',
      startHeight: 60,
      endHeight: 60,
      builtDay: 0,
    });
  for (let row = 0; row <= 6; row++)
    road(-432, row * 72 - 216, 432, row * 72 - 216);
  for (let col = 0; col <= 6; col++)
    road(col * 144 - 432, -216, col * 144 - 432, 216);
  Object.assign(s, roads.snapshot());
  const zones = ['RL', 'RH', 'CL', 'CH', 'I', 'O'] as const;
  const models = catalogModels();
  const base = districtFixture(1)[0]!;
  s.buildings = Array.from({ length: 108 }, (_, i) => {
    const col = i % 18,
      row = Math.floor(i / 18),
      zone = zones[Math.floor(col / 3)]!;
    const choices = models.filter((m) => m.zone === zone);
    const m = choices[((row * 3 + (col % 3)) * 5) % choices.length]!;
    return {
      ...structuredClone(base),
      id: 10001 + i,
      defId: m.zone,
      level: m.level,
      lotW: m.w,
      lotD: m.d,
      seed: m.variant - 1,
      pos: { x: col * 48 - 408, z: row * 72 - 206 },
      rotation: 0,
      state: 'active' as const,
      stateTimer: 0,
      flags: 0,
    };
  });
  // Size real utility capacity after the same population/job projection used on load.
  updatePopulation(s);
  updatePower(s);
  const powerDemand = s.stats.power.consumed;
  const waterDemand = s.buildings.reduce(
    (sum, b) => sum + b.jobs * UTILITY_RULES.waterM3PerWeek.job,
    0,
  );
  const tower = BUILDINGS.find((b) => b.id === 'water_tower')!;
  const treatment = BUILDINGS.find((b) => b.id === 'water_treatment')!;
  const utilities = [
    ...Array.from(
      { length: Math.max(1, Math.ceil(powerDemand / 40)) },
      () => 'power_coal',
    ),
    ...Array.from(
      {
        length: Math.max(
          1,
          Math.ceil(waterDemand / tower.water!.capacityM3PerWeek),
        ),
      },
      () => 'water_tower',
    ),
    ...Array.from(
      {
        length: Math.max(
          1,
          Math.ceil(waterDemand / treatment.water!.capacityM3PerWeek),
        ),
      },
      () => 'water_treatment',
    ),
  ];
  for (const [i, defId] of utilities.entries()) {
    const def = BUILDINGS.find((b) => b.id === defId)!;
    s.buildings.push({
      ...structuredClone(base),
      id: 11000 + i,
      kind: 'utility',
      defId,
      lotW: def.footprintCells![0],
      lotD: def.footprintCells![1],
      pos: { x: 488, z: -200 + i * 64 },
      rotation: 0,
      state: 'active',
    });
  }
  const utilityEnd = Math.max(216, -200 + utilities.length * 64);
  road(456, -216, 456, utilityEnd);
  road(432, -216, 456, -216);
  Object.assign(s, roads.snapshot());
  s.networks.power = Array.from({ length: 6 }, (_, row) => ({
    id: 12000 + row,
    points: [
      { x: -432, z: row * 72 - 211 },
      { x: 472, z: row * 72 - 211 },
    ],
  }));
  s.networks.power.push({
    id: 12010,
    points: [
      { x: 432, z: -211 },
      { x: 432, z: 149 },
    ],
  });
  s.networks.power.push({
    id: 12011,
    points: [
      { x: 472, z: -211 },
      { x: 472, z: utilityEnd },
    ],
  });
  s.networks.water = s.networks.power.map((n) => ({
    id: n.id + 1000,
    points: structuredClone(n.points),
  }));
  updatePower(s);
  updateWater(s);
  if (s.buildings.some((b) => !(b.flags & 1)))
    throw new Error('Art-review grid must power every building');
  if (s.buildings.some((b) => b.kind === 'zoned' && (b.flags & 7) !== 7))
    throw new Error('Art-review utilities must serve every zoned building');
  const ticks = hourTicks(hour);
  s.clock = {
    ticks,
    day: Math.floor(ticks / TIME.ticksPerDay),
    tickInDay: ticks % TIME.ticksPerDay,
    speed: 0,
  };
  s.nextId = 20000;
  const snapshot = new Simulation(s.settings, undefined, s).snapshot();
  return {
    data: Array.from(new Uint8Array(await serialize(snapshot))),
    settings: snapshot.settings,
    population: 0,
    day: snapshot.clock.day,
  };
}
