import { describe, expect, it, vi } from 'vitest';
import { FloatType, RedFormat, type WebGLRenderer } from 'three';
import { WaterRenderer } from '../../src/render/water/waterRenderer';
import { Terrain } from '../../src/world/terrain';
import { SEA_LEVEL, WORLD } from '../../src/data/config';
import { WATER } from '../../src/data/water';

const terrain = new Terrain(20261006);
const compile = (water: WaterRenderer) => {
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
  } as Parameters<typeof water.material.onBeforeCompile>[0];
  water.material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
};
describe('water surface', () => {
  it('uploads the unflipped world height grid and keeps the sea plane out of the depth buffer', () => {
    const water = new WaterRenderer(terrain);
    expect(water.heightTexture.image.data).toBe(terrain.heights);
    expect(water.heightTexture.image.width).toBe(WORLD.heightmapVertices);
    expect(water.heightTexture.image.height).toBe(WORLD.heightmapVertices);
    expect(water.heightTexture.flipY).toBe(false);
    expect(water.heightTexture.format).toBe(RedFormat);
    expect(water.heightTexture.type).toBe(FloatType);
    expect(water.mesh.position.y).toBe(SEA_LEVEL);
    expect(water.material.depthWrite).toBe(false);
    expect(water.material.depthTest).toBe(true);
    expect(water.mesh.receiveShadow).toBe(true);
    water.dispose();
  });
  it('preserves the lighting hook, shares animation uniforms and bounds pause/resume deltas', () => {
    const water = new WaterRenderer(terrain);
    const light = vi.fn();
    water.installShader(light);
    const shader = compile(water),
      textureVersion = water.heightTexture.version;
    expect(light).toHaveBeenCalledOnce();
    expect(shader.uniforms.waterHeights!.value).toBe(water.heightTexture);
    const phase = shader.uniforms.waterPhase!;
    water.update(1000);
    expect(phase.value).toBeCloseTo(WATER.maxFrameSeconds * WATER.angularSpeed);
    water.update(NaN);
    water.update(-1);
    expect(phase.value).toBeCloseTo(WATER.maxFrameSeconds * WATER.angularSpeed);
    expect(water.heightTexture.version).toBe(textureVersion);
    water.installShader();
    expect(compile(water).uniforms.waterPhase).toBe(phase);
    for (let i = 0; i < 10000; i++) water.update(0.05);
    expect(phase.value).toBeGreaterThanOrEqual(0);
    expect(phase.value).toBeLessThan(2 * Math.PI);
    water.dispose();
  });
  it('uploads edited heights once and releases owned GPU resources', () => {
    const terrain = new Terrain(17),
      water = new WaterRenderer(terrain);
    const version = water.heightTexture.version;
    terrain.flatten(
      [
        { x: 0, z: 0 },
        { x: 64, z: 0 },
        { x: 64, z: 64 },
        { x: 0, z: 64 },
      ],
      20,
    );
    water.update(0);
    expect(water.heightTexture.version).toBe(version + 1);
    water.update(0);
    expect(water.heightTexture.version).toBe(version + 1);
    const texture = vi.spyOn(water.heightTexture, 'dispose');
    const geometry = vi.spyOn(water.mesh.geometry, 'dispose');
    const material = vi.spyOn(water.material, 'dispose');
    water.dispose();
    expect(texture).toHaveBeenCalledOnce();
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
  });
});
