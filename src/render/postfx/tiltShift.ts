import { Vector2 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { POSTFX as P } from '../../data/postfx';
export const SCREEN_VERTEX = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

/** Camera height over its focus, not terrain sea-level elevation. */
export function tiltStrength(height: number): number {
  if (
    !Number.isFinite(height) ||
    height <= P.tiltStartM ||
    height >= P.tiltEndM
  )
    return 0;
  const t =
    height < P.tiltFullM
      ? (height - P.tiltStartM) / (P.tiltFullM - P.tiltStartM)
      : height > P.tiltFadeM
        ? (P.tiltEndM - height) / (P.tiltEndM - P.tiltFadeM)
        : 1;
  return t * t * (3 - 2 * t);
}
export function createTiltPass(): ShaderPass {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      direction: { value: new Vector2() },
      strength: { value: 0 },
    },
    vertexShader: SCREEN_VERTEX,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 direction; uniform float strength; varying vec2 vUv;
      void main() {
        float lower = 1.0-smoothstep(0.0,${P.focusY - P.focusHalfBand},vUv.y);
        float upper = smoothstep(${P.focusY + P.focusHalfBand},1.0,vUv.y);
        vec2 stepUv = direction * strength * max(lower,upper) * ${P.tiltRadiusPx};
        vec4 color = texture2D(tDiffuse,vUv)*0.28;
        color += (texture2D(tDiffuse,vUv+stepUv)+texture2D(tDiffuse,vUv-stepUv))*0.22;
        color += (texture2D(tDiffuse,vUv+stepUv*2.0)+texture2D(tDiffuse,vUv-stepUv*2.0))*0.1;
        color += (texture2D(tDiffuse,vUv+stepUv*3.0)+texture2D(tDiffuse,vUv-stepUv*3.0))*0.04;
        gl_FragColor = color;
      }`,
  });
}
