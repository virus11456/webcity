import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

/** Shared radial light sprites or ground decals: one draw call, no point lights or textures. */
export class LightGlows {
  readonly mesh: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  constructor(
    capacity: number,
    color: string,
    size: number,
    billboard: boolean,
    opacity = 1,
  ) {
    const geometry = new PlaneGeometry(1, 1);
    if (!billboard) geometry.rotateX(-Math.PI / 2);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        glowColor: { value: new Color(color) },
        strength: { value: 0 },
        size: { value: size },
        opacity: { value: opacity },
      },
      vertexShader: `varying vec2 glowUv; uniform float size;
        void main() { glowUv = uv;
          ${
            billboard
              ? `vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          centre.xy += position.xy * size; gl_Position = projectionMatrix * centre;`
              : `gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position * size,1.0);`
          }
        }`,
      fragmentShader: `varying vec2 glowUv; uniform vec3 glowColor; uniform float strength; uniform float opacity;
        void main() { float radius = length(glowUv - 0.5) * 2.0;
          float glow = pow(max(0.0,1.0-radius),2.0);
          gl_FragColor = vec4(glowColor * (1.0 + strength),glow * strength * opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new InstancedMesh(geometry, material, Math.max(1, capacity));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  }
  setNight(value: number): void {
    this.mesh.material.uniforms.strength!.value = value;
    this.mesh.visible = value > 0;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
