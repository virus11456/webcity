import { expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { tiltStrength } from '../../src/render/postfx/tiltShift';
import { PostProcessing } from '../../src/render/postfx/pipeline';
import { AmbientOcclusion } from '../../src/render/postfx/ambientOcclusion';
it('fades tilt between 60-150 and 600-1200 metres and keeps ground and panorama sharp', () => {
  for (const h of [-1, 0, 60, 1200, 4000, NaN]) expect(tiltStrength(h)).toBe(0);
  for (const h of [150, 200, 400, 600]) expect(tiltStrength(h)).toBe(1);
  expect(tiltStrength(105)).toBe(0.5);
  expect(tiltStrength(900)).toBe(0.5);
  expect(tiltStrength(60.01)).toBeLessThan(0.000001);
});
it('enables AO only on high, bloom only at night, and FXAA only below DPR 2', () => {
  const renderer = { getPixelRatio: () => 1 } as WebGLRenderer;
  for (const level of ['medium', 'high'] as const) {
    const pipeline = new PostProcessing(
      renderer,
      new Scene(),
      new PerspectiveCamera(),
      level,
    );
    pipeline.resize(393, 852, 1);
    pipeline.update(200, 0);
    expect(pipeline.flags).toBe(level === 'high' ? 11 : 9);
    pipeline.update(200, 1);
    expect(pipeline.flags).toBe(level === 'high' ? 15 : 13);
    pipeline.resize(393, 852, 2);
    pipeline.update(200, 1);
    expect(pipeline.flags).toBe(level === 'high' ? 7 : 5);
    pipeline.update(40, 0);
    expect(pipeline.flags).toBe(level === 'high' ? 2 : 0);
    pipeline.dispose();
  }
});
it('keeps AO reconstruction matrices connected to camera projection after resize', () => {
  const camera = new PerspectiveCamera(),
    pass = new AmbientOcclusion(camera);
  expect(pass.uniforms.inverseProjection!.value).toBe(
    camera.projectionMatrixInverse,
  );
  camera.aspect = 393 / 852;
  camera.updateProjectionMatrix();
  expect(pass.uniforms.projection!.value).toBe(camera.projectionMatrix);
  pass.dispose();
});
