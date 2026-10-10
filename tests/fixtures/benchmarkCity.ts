import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import type { Vec2 } from '../../src/world/types';
/** Controlled flat terrain; all construction, growth and migration run through the real simulation. */
export async function benchmarkCity() {
  const sim = new Simulation({
    seed: 20261006,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '5000 population benchmark',
  });
  const off = sim.onDay((s) => {
    const size = Math.sqrt(s.terrain.heights.length);
    for (let i = 0; i < s.terrain.heights.length; i++)
      s.terrain.heights[i] = (i % size) * 16 - 2400 >= 400 ? 20 : 60;
  });
  for (let i = 0; i < 10; i++) sim.tick();
  off();
  const check = (r: { ok: boolean; reason?: string }) => {
    if (!r.ok) throw new Error(r.reason);
  };
  const road = (start: Vec2, end: Vec2) =>
    check(
      sim.buildRoad('road_small', {
        start,
        end,
        c1: {
          x: start.x + (end.x - start.x) / 3,
          z: start.z + (end.z - start.z) / 3,
        },
        c2: {
          x: start.x + ((end.x - start.x) * 2) / 3,
          z: start.z + ((end.z - start.z) * 2) / 3,
        },
        elevated: false,
      }),
    );
  const rows = [-256, -128, 0, 128, 256];
  for (const z of rows) road({ x: -320, z }, { x: 192, z });
  road({ x: 192, z: -256 }, { x: 192, z: 256 });
  check(sim.place('power_coal', { x: -368, z: 0 }, 0));
  check(sim.place('water_pump', { x: 382, z: -100 }, Math.PI * 1.5));
  check(sim.place('water_drain', { x: 382, z: 200 }, Math.PI * 1.5));
  for (const net of ['power', 'water'] as const) {
    const build = (p: Vec2[]) => {
      for (let i = 1; i < p.length; i++) {
        const edge = [p[i - 1]!, p[i]!];
        check(
          net === 'power'
            ? sim.buildPowerLine(edge)
            : sim.buildWaterPipes(edge),
        );
      }
    };
    build([
      { x: 352, z: -256 },
      { x: 352, z: 256 },
      { x: 192, z: 256 },
      { x: 192, z: -256 },
    ]);
    for (const z of rows)
      build([
        { x: -368, z },
        { x: 192, z },
      ]);
    build([
      { x: -368, z: -256 },
      { x: -368, z: 256 },
    ]);
  }
  for (const b of sim.snapshot().zoneBlocks) {
    const cells = [...b.cells].flatMap((v, i) =>
      v === 0 ? [[b.id, i] as [number, number]] : [],
    );
    if (cells.length) check(sim.zone(cells, 'RH'));
  }
  let population = 0;
  const stop = sim.onDay((s) => {
    population = s.stats.population;
  });
  for (let i = 0; i < 600 && population < 5000; i++) sim.tick();
  stop();
  sim.setSpeed(0);
  const snapshot = sim.snapshot();
  if (snapshot.stats.population < 5000)
    throw new Error(`Only ${snapshot.stats.population} residents`);
  return {
    data: Array.from(new Uint8Array(await serialize(snapshot))),
    settings: snapshot.settings,
    population: snapshot.stats.population,
    day: snapshot.clock.day,
    buildings: snapshot.buildings.length,
  };
}
