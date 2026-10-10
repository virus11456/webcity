import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { serialize } from '../../src/save/serializer';
import { MAP_SIZE, SEA_LEVEL, WORLD } from '../../src/data/config';

/** Saved visual fixture: a broad shallow bank, curved river, and a polluted downstream field. */
export async function waterSurfaceCity() {
  const state = createState({
    seed: 20261011,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: '河岸材質驗證',
  });
  state.clock.speed = 0;
  for (let z = 0; z < WORLD.heightmapVertices; z++) {
    const pz = z * WORLD.heightmapSpacingM - MAP_SIZE / 2;
    const centre = Math.sin(pz / 400) * 40;
    state.terrain.river[z] = centre;
    for (let x = 0; x < WORLD.heightmapVertices; x++) {
      const distance = Math.abs(
        x * WORLD.heightmapSpacingM - MAP_SIZE / 2 - centre,
      );
      state.terrain.heights[z * WORLD.heightmapVertices + x] =
        SEA_LEVEL - 12 + Math.min(16, ((distance * distance) / 10000) * 12);
    }
  }
  const sim = new Simulation(state.settings, undefined, state);
  const snapshot = sim.snapshot();
  snapshot.terrain.riverWidth = 200;
  snapshot.environmentVersion = 1;
  for (let z = 0; z < WORLD.fieldCells; z++)
    for (let x = 0; x < WORLD.fieldCells; x++) {
      snapshot.fields.waterPollution[z * WORLD.fieldCells + x] =
        z >= WORLD.fieldCells / 2 ? 85 : 0;
    }
  return {
    settings: state.settings,
    population: 0,
    day: 0,
    data: Array.from(new Uint8Array(await serialize(snapshot))),
  };
}
