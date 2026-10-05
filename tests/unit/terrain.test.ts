import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Terrain } from '../../src/world/terrain';
import { MAP_PRESETS } from '../../src/data/terrain';
import {
  MAP_SIZE,
  SEA_LEVEL,
  TERRAIN_GENERATION,
  TILE_SIZE,
  WORLD,
} from '../../src/data/config';
const hash = (t: Terrain): string =>
  createHash('sha256')
    .update(new Uint8Array(t.heights.buffer))
    .update(t.resources.fertile)
    .update(t.resources.forest)
    .update(t.resources.ore)
    .update(t.resources.oil)
    .digest('hex');
const valley = new Terrain(MAP_PRESETS[0].seed);
describe('deterministic terrain', () => {
  it('reproduces heights and resources byte for byte and changes with the seed', () => {
    expect(hash(new Terrain(valley.seed))).toBe(hash(valley));
    expect(hash(new Terrain(valley.seed + 1))).not.toBe(hash(valley));
  });
  for (const preset of MAP_PRESETS)
    it(`${preset.id} has a habitable center and a connected, descending river`, () => {
      const t =
        preset.id === 'valley' ? valley : new Terrain(preset.seed, preset);
      let habitable = 0,
        total = 0;
      for (let z = -TILE_SIZE / 2 + 8; z < TILE_SIZE / 2; z += 16)
        for (let x = -TILE_SIZE / 2 + 8; x < TILE_SIZE / 2; x += 16) {
          total++;
          const h = t.heightAt(x, z);
          if (
            t.slopeAt(x, z) < TERRAIN_GENERATION.centralMaxSlopeExclusive &&
            h >= SEA_LEVEL + 5 &&
            h <= SEA_LEVEL + 30
          )
            habitable++;
        }
      expect(habitable / total).toBeGreaterThanOrEqual(0.7);
      for (let j = 0; j < WORLD.heightmapVertices; j++) {
        const z = j * 16 - MAP_SIZE / 2;
        expect(t.heightAt(t.river[j]!, z)).toBeLessThan(SEA_LEVEL);
        if (j) {
          expect(Math.abs(t.river[j]! - t.river[j - 1]!)).toBeLessThan(16);
          expect(t.heightAt(t.river[j]!, z)).toBeLessThanOrEqual(
            t.heightAt(t.river[j - 1]!, z - 16) + 0.01,
          );
        }
      }
      expect(Math.min(...t.heights)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...t.heights)).toBeLessThanOrEqual(400);
      expect(
        Object.values(t.resources).every((field) => field.length === 300 * 300),
      ).toBe(true);
      expect(t.resources.oil.some((value) => value > 0)).toBe(true);
    });
  it('bilinearly interpolates vertices and clamps map edges', () => {
    const t = new Terrain(17);
    t.heights.fill(0);
    t.heights[0] = 10;
    t.heights[1] = 20;
    t.heights[301] = 30;
    t.heights[302] = 40;
    expect(t.heightAt(-2392, -2392)).toBe(25);
    expect(t.heightAt(-9999, -9999)).toBe(10);
    expect(() => t.heightAt(NaN, 0)).toThrow(RangeError);
  });
  it('measures slopes as rise/run and flattens only polygon vertices', () => {
    const t = new Terrain(19);
    for (let j = 0; j < 301; j++)
      for (let i = 0; i < 301; i++) t.heights[j * 301 + i] = i * 1.6;
    expect(t.slopeAt(0, 0)).toBeCloseTo(0.1, 5);
    const outside = t.heightAt(1000, 1000);
    t.flatten(
      [
        { x: -100, z: -100 },
        { x: 100, z: -100 },
        { x: 100, z: 100 },
        { x: -100, z: 100 },
      ],
      55,
    );
    expect(t.heightAt(0, 0)).toBe(55);
    expect(t.slopeAt(0, 0)).toBe(0);
    expect(t.heightAt(1000, 1000)).toBe(outside);
    expect(t.revision).toBe(1);
    expect(() => t.flatten([], 0)).toThrow(RangeError);
  });
});
