import {
  DepthTexture,
  HalfFloatType,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { POSTFX as P } from '../../data/postfx';
import type { QualityLevel } from '../../data/config';
import { AmbientOcclusion } from './ambientOcclusion';
import { createTiltPass, tiltStrength } from './tiltShift';

/** HDR -> depth AO -> night bloom -> tilt -> ACES/sRGB -> optional FXAA. */
export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly ao: AmbientOcclusion | null;
  private readonly bloom = new UnrealBloomPass(
    new Vector2(1, 1),
    P.bloomStrength,
    P.bloomRadius,
    P.bloomThreshold,
  );
  private readonly horizontal = createTiltPass();
  private readonly vertical = createTiltPass();
  private readonly fxaa = new ShaderPass(FXAAShader);
  tilt = 0;
  flags = 0;
  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    level: Exclude<QualityLevel, 'low'>,
  ) {
    this.bloom.bloomTintColors.forEach((color, index) =>
      color.setScalar(P.bloomMipWeights[index]!),
    );
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    if (level === 'high')
      target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = level === 'high' ? new AmbientOcclusion(camera) : null;
    if (this.ao) this.composer.addPass(this.ao);
    for (const pass of [
      this.bloom,
      this.horizontal,
      this.vertical,
      new OutputPass(),
      this.fxaa,
    ])
      this.composer.addPass(pass);
  }
  resize(width: number, height: number, dpr: number): void {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.horizontal.uniforms.direction!.value.set(1 / width, 0);
    this.vertical.uniforms.direction!.value.set(0, 1 / height);
    this.fxaa.uniforms.resolution!.value.set(
      1 / (width * dpr),
      1 / (height * dpr),
    );
    this.fxaa.enabled = dpr < 2;
  }
  update(height: number, night: number, tiltEnabled = true): void {
    this.tilt = tiltEnabled ? tiltStrength(height) : 0;
    this.horizontal.enabled = this.vertical.enabled = this.tilt > 0;
    this.horizontal.uniforms.strength!.value =
      this.vertical.uniforms.strength!.value = this.tilt;
    this.bloom.enabled = night > 0;
    this.bloom.strength = night * P.bloomStrength;
    this.flags =
      (this.tilt > 0 ? 1 : 0) |
      (this.ao ? 2 : 0) |
      (this.bloom.enabled ? 4 : 0) |
      (this.fxaa.enabled ? 8 : 0);
  }
  render(seconds = 0): void {
    this.composer.render(seconds);
  }
  dispose(): void {
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }
}
