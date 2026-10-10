import { describe, expect, it } from 'vitest';
import { waterNormalPixels } from '../../src/world/waterAppearance';
import { WATER_DETAIL as D } from '../../src/data/water';
import { WaterRenderer } from '../../src/render/water/waterRenderer';
import { Terrain } from '../../src/world/terrain';
import { WORLD } from '../../src/data/config';
import type { DataTexture, WebGLRenderer } from 'three';
import { environmentState } from '../fixtures/environmentCity';
import { Simulation } from '../../src/sim/simulation';

describe('water visual inputs', () => {
  it('generates stable normalized tangent-space ripples', () => {
    const pixels = waterNormalPixels();
    expect(pixels).toEqual(waterNormalPixels());
    expect(pixels.length).toBe(D.normalSize ** 2 * 4);
    let nonflat = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const x = (pixels[i]! / 255) * 2 - 1,
        y = (pixels[i + 1]! / 255) * 2 - 1,
        z = (pixels[i + 2]! / 255) * 2 - 1;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
      expect(z).toBeGreaterThan(0);
      if (Math.abs(x) > 0.1) nonflat++;
    }
    expect(nonflat).toBeGreaterThan(1000);
  });
  it('hydrates a saved river and clamps actual pollution without writing to the event', () => {
    const water = new WaterRenderer(new Terrain(17));
    water.installShader();
    const shader = {
      uniforms: {},
      vertexShader: '#include <begin_vertex>',
      fragmentShader:
        '#include <color_fragment>\n#include <normal_fragment_maps>',
    } as Parameters<typeof water.material.onBeforeCompile>[0];
    water.material.onBeforeCompile(shader, {} as WebGLRenderer);
    const texture = shader.uniforms.waterPollution!.value as DataTexture;
    const river = shader.uniforms.waterRiver!.value as DataTexture;
    const state = environmentState();
    // The renderer only needs these existing fields from a worker ready payload.
    const sim = new Simulation(state.settings, undefined, state);
    water.accept({ t: 'ready', reqId: 0, snapshot: sim.snapshot() });
    expect(Array.from(river.image.data!)).toEqual(
      Array.from(state.terrain.river),
    );
    const data = new Float32Array(WORLD.fieldCells ** 2);
    data.set([-10, 50, 200]);
    water.accept({ t: 'fields', which: 'waterPollution', data });
    expect(Array.from(texture.image.data!.slice(0, 3))).toEqual([0, 128, 255]);
    expect(Array.from(data.slice(0, 3))).toEqual([-10, 50, 200]);
    expect(river.image.data?.length).toBe(state.terrain.river.length);
    const version = texture.version;
    water.update(0.016);
    expect(texture.version).toBe(version);
    water.dispose();
  });
});
