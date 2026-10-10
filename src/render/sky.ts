import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { ENVIRONMENT_PALETTE, LIGHT_PALETTE } from '../data/palette';
import { SEA_LEVEL } from '../data/config';
import { LIGHTING, RENDER_PREVIEW } from '../data/rendering';

/** Smoothly thin atmosphere above sea level; ground-level ART density stays intact. */
export function fogDensityAtHeight(cameraY: number): number {
  const height = Number.isFinite(cameraY) ? cameraY - SEA_LEVEL : 0;
  const t = Math.max(
    0,
    Math.min(
      1,
      (height - LIGHTING.fogFadeStartM) /
        (LIGHTING.fogFadeEndM - LIGHTING.fogFadeStartM),
    ),
  );
  return (
    LIGHTING.fogDensity *
    (1 - (1 - LIGHTING.highAltitudeFogRatio) * t * t * (3 - 2 * t))
  );
}

/** Create a gradient sky sphere with a small sun glow; no texture assets required. */
export function createSky(): Mesh<SphereGeometry, ShaderMaterial> {
  return new Mesh(
    new SphereGeometry(RENDER_PREVIEW.skyRadiusM, 24, 12),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new Color(ENVIRONMENT_PALETTE.sky_zenith) },
        horizon: { value: new Color(ENVIRONMENT_PALETTE.sky_horizon) },
        sunColor: { value: new Color(LIGHT_PALETTE.sun) },
        sunDirection: {
          value: new Vector3(...LIGHTING.sunDirection).normalize(),
        },
      },
      vertexShader: `varying vec3 vDirection;
      void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDirection;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float gradient = pow(max(direction.y, 0.0), ${LIGHTING.skyGradientPower});
        vec3 color = mix(horizon, zenith, gradient);
        float glow = pow(max(dot(direction, sunDirection), 0.0), ${LIGHTING.sunGlowPower.toFixed(1)});
        gl_FragColor = vec4(color + sunColor * glow * ${LIGHTING.sunGlowStrength}, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
}
