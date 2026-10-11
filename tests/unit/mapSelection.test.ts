import { describe, it, expect } from 'vitest';
import { resolveMap } from '../../src/world/mapSelection';
import { MAP_PRESETS } from '../../src/data/terrain';
import { Terrain } from '../../src/world/terrain';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { serialize, deserialize } from '../../src/save/serializer';
describe('map selection', () => {
  it('preserves all preset terrain and rejects unknown maps or unsafe seeds', () => {
    for (const p of MAP_PRESETS) expect(resolveMap(p.id, p.seed)).toEqual(p);
    expect(resolveMap('missing', 42)).toBeUndefined();
    expect(resolveMap('random', Infinity)).toBeUndefined();
    expect(resolveMap('random', 1.2)).toBeUndefined();
  });
  it('reproduces random terrain from the same seed and retains a habitable center', () => {
    for (const seed of [42, 173, 982451]) {
      const p = resolveMap('random', seed)!,
        a = new Terrain(seed, p),
        b = createState({
          seed,
          mapId: 'random',
          mode: 'sandbox',
          cityName: 'Random',
        });
      expect(a.heights).toEqual(b.terrain.heights);
      let total = 0,
        flat = 0;
      for (let z = -472; z < 480; z += 16)
        for (let x = -472; x < 480; x += 16) {
          total++;
          const h = a.heightAt(x, z);
          if (a.slopeAt(x, z) < 0.1 && h >= 45 && h <= 70) flat++;
        }
      expect(flat / total).toBeGreaterThanOrEqual(0.7);
    }
    expect(resolveMap('random', 42)).not.toEqual(resolveMap('random', 43));
  });
  it('keeps random map identity, edited heights and resources through save/load', async () => {
    const s = createState({
      seed: -42,
      mapId: 'random',
      mode: 'normal',
      cityName: 'Random',
    });
    s.terrain.heights[0] = 99;
    const restored = await deserialize(await serialize(s));
    const sim = new Simulation(restored.settings, undefined, restored);
    expect(sim.snapshot().settings.mapId).toBe('random');
    expect(sim.snapshot().terrain.heights).toEqual(s.terrain.heights);
    expect(sim.snapshot().terrain.resources).toEqual(s.terrain.resources);
  });
});
