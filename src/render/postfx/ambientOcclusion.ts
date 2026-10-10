import type {
  PerspectiveCamera,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { POSTFX as P } from '../../data/postfx';
import { SCREEN_VERTEX } from './tiltShift';

/** Eight depth samples in view-space metres; reuses real scene depth including custom shaders. */
export class AmbientOcclusion extends ShaderPass {
  constructor(camera: PerspectiveCamera) {
    super({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        inverseProjection: { value: camera.projectionMatrixInverse },
        projection: { value: camera.projectionMatrix },
      },
      vertexShader: SCREEN_VERTEX,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth;
        uniform mat4 inverseProjection; uniform mat4 projection; varying vec2 vUv;
        vec3 viewPosition(vec2 uv,float depth) {
          vec4 p = inverseProjection * vec4(uv*2.0-1.0,depth*2.0-1.0,1.0); return p.xyz/p.w;
        }
        void main() {
          vec4 color = texture2D(tDiffuse,vUv);
          float depth = texture2D(tDepth,vUv).r;
          vec3 centre = viewPosition(vUv,depth);
          vec3 normal = normalize(cross(dFdx(centre),dFdy(centre)));
          if (depth >= 1.0) { gl_FragColor = color; return; }
          float sum = 0.0;
          for(int i=0;i<8;i++) {
            float angle = float(i)*2.39996323;
            float radius = ${P.aoRadiusM.toFixed(1)} * (0.25+0.75*float(i+1)/8.0);
            vec2 uv = vUv + vec2(cos(angle)*projection[0][0],sin(angle)*projection[1][1]) * radius / max(1.0,-centre.z) * 0.5;
            if (uv.x<0.0 || uv.x>1.0 || uv.y<0.0 || uv.y>1.0) continue;
            vec3 delta = viewPosition(uv,texture2D(tDepth,uv).r) - centre;
            float distance = length(delta);
            float cosine = max(0.0,dot(normal,delta/max(distance,0.001))-${P.aoBias});
            sum += cosine * (1.0-smoothstep(0.0,${P.aoRadiusM.toFixed(1)},distance));
          }
          gl_FragColor = vec4(color.rgb * (1.0-clamp(sum/4.0,0.0,1.0)*${P.aoStrength}),color.a);
        }`,
    });
    // ShaderPass clones inputs; these matrices must follow camera resize in-place.
    this.uniforms.inverseProjection!.value = camera.projectionMatrixInverse;
    this.uniforms.projection!.value = camera.projectionMatrix;
  }
  override render(
    renderer: WebGLRenderer,
    write: WebGLRenderTarget,
    read: WebGLRenderTarget,
    seconds: number,
    mask: boolean,
  ): void {
    this.uniforms.tDepth!.value = read.depthTexture;
    super.render(renderer, write, read, seconds, mask);
  }
}
