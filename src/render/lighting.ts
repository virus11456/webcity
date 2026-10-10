import {
  DirectionalLight,
  HemisphereLight,
  Vector3,
  type Material,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { QUALITY, type QualityLevel } from '../data/config';
import { LIGHT_PALETTE } from '../data/palette';
import type { DayNight } from './dayNight';
import { LIGHTING } from '../data/rendering';

/** Own daylight and tier-specific shadows; dispose before switching tiers. */
export class Lighting {
  readonly hemisphere = new HemisphereLight(
    LIGHT_PALETTE.sky,
    LIGHT_PALETTE.ground,
    LIGHTING.hemisphereIntensity,
  );
  readonly sun: DirectionalLight | null;
  readonly csm: CSM | null;
  private readonly direction = new Vector3(
    ...LIGHTING.sunDirection,
  ).normalize();

  private readonly shadowFocus = new Vector3();
  private readonly shadowRight = new Vector3(
    this.direction.z,
    0,
    -this.direction.x,
  ).normalize();
  private readonly shadowUp = new Vector3()
    .crossVectors(this.direction, this.shadowRight)
    .normalize();

  /** Install three cascades on high, a single shadow on medium, and no shadow on low. */
  constructor(
    private readonly scene: Scene,
    camera: PerspectiveCamera,
    level: QualityLevel,
    materials: readonly Material[],
  ) {
    scene.add(this.hemisphere);
    if (level === 'high') {
      this.sun = null;
      this.csm = new CSM({
        camera,
        parent: scene,
        cascades: LIGHTING.cascades,
        maxFar: LIGHTING.shadowRangeM,
        mode: 'practical',
        shadowMapSize: QUALITY.high.shadowMapSize,
        shadowBias: LIGHTING.shadowBias,
        lightDirection: this.direction.clone().negate(),
        lightIntensity: LIGHTING.sunIntensity,
      });
      this.csm.fade = true;
      this.csm.updateFrustums();
      for (const light of this.csm.lights) {
        light.color.set(LIGHT_PALETTE.sun);
        light.shadow.normalBias = LIGHTING.shadowNormalBias;
      }
      for (const material of materials) this.csm.setupMaterial(material);
    } else {
      this.csm = null;
      this.sun = new DirectionalLight(LIGHT_PALETTE.sun, LIGHTING.sunIntensity);
      this.sun.castShadow = level === 'medium';
      this.sun.shadow.mapSize.setScalar(QUALITY.medium.shadowMapSize);
      const half = LIGHTING.shadowRangeM / 2;
      Object.assign(this.sun.shadow.camera, {
        left: -half,
        right: half,
        top: half,
        bottom: -half,
        near: 1,
        far: LIGHTING.shadowRangeM * 2,
      });
      this.sun.shadow.camera.updateProjectionMatrix();
      this.sun.shadow.bias = LIGHTING.shadowBias;
      this.sun.shadow.normalBias = LIGHTING.shadowNormalBias;
      scene.add(this.sun, this.sun.target);
    }
  }
  /** Apply ART keyframe colors to the active tier without replacing lights. */
  setEnvironment(day: DayNight): void {
    this.hemisphere.intensity = day.ambientIntensity;
    this.hemisphere.color.set(LIGHT_PALETTE.sky);
    if (this.sun) {
      this.sun.color.copy(day.sun);
      this.sun.intensity = day.sunIntensity;
    }
    if (this.csm)
      for (const light of this.csm.lights) {
        light.color.copy(day.sun);
        light.intensity = day.sunIntensity;
      }
  }
  /** Follow the camera focus without allocating vectors per frame. */
  update(focus: Vector3): void {
    if (this.sun) {
      this.shadowFocus.copy(focus);
      if (this.sun.castShadow) {
        // Snap in the light's image plane, retaining the exact light direction.
        const texel = LIGHTING.shadowRangeM / this.sun.shadow.mapSize.x;
        const x = focus.dot(this.shadowRight),
          y = focus.dot(this.shadowUp);
        this.shadowFocus.addScaledVector(
          this.shadowRight,
          Math.round(x / texel) * texel - x,
        );
        this.shadowFocus.addScaledVector(
          this.shadowUp,
          Math.round(y / texel) * texel - y,
        );
      }
      this.sun.target.position.copy(this.shadowFocus);
      this.sun.position
        .copy(this.direction)
        .multiplyScalar(LIGHTING.shadowRangeM)
        .add(this.shadowFocus);
      this.sun.target.updateMatrixWorld();
    }
    this.csm?.update();
  }
  /** Recalculate cascade frustums after camera aspect changes. */
  resize(): void {
    this.csm?.updateFrustums();
  }
  /** Release shadow maps, scene nodes and CSM material hooks. */
  dispose(): void {
    this.scene.remove(this.hemisphere);
    this.hemisphere.dispose();
    if (this.csm) {
      for (const light of this.csm.lights) light.dispose();
      this.csm.remove();
      this.csm.dispose();
    }
    if (this.sun) {
      this.scene.remove(this.sun, this.sun.target);
      this.sun.dispose();
    }
  }
}
