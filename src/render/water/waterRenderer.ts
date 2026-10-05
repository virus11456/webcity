import {
  Color,
  DataTexture,
  FloatType,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  type Material,
} from 'three';
import { MAP_SIZE, SEA_LEVEL, WORLD } from '../../data/config';
import { ENVIRONMENT_PALETTE } from '../../data/palette';
import { WATER } from '../../data/water';
import type { Terrain } from '../../world/terrain';

/** One depth-colored water surface; animation changes a uniform, never the geometry. */
export class WaterRenderer {
  readonly heightTexture: DataTexture;
  readonly material = new MeshStandardMaterial({
    transparent: true,
    depthWrite: false,
    roughness: WATER.roughness,
    metalness: WATER.metalness,
  });
  readonly mesh = new Mesh(
    new PlaneGeometry(MAP_SIZE, MAP_SIZE),
    this.material,
  );
  private readonly phase = { value: 0 };
  private revision: number;

  constructor(private readonly terrain: Terrain) {
    this.heightTexture = new DataTexture(
      terrain.heights,
      WORLD.heightmapVertices,
      WORLD.heightmapVertices,
      RedFormat,
      FloatType,
    );
    // Explicit four-texel interpolation avoids relying on float-linear filtering support.
    this.heightTexture.minFilter = NearestFilter;
    this.heightTexture.magFilter = NearestFilter;
    this.heightTexture.generateMipmaps = false;
    this.heightTexture.needsUpdate = true;
    this.revision = terrain.revision;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = SEA_LEVEL;
    this.mesh.receiveShadow = true;
  }

  /** Install after optional CSM setup so depth coloring survives all quality tiers. */
  installShader(lightingHook?: Material['onBeforeCompile']): void {
    this.material.onBeforeCompile = (shader, renderer) => {
      lightingHook?.call(this.material, shader, renderer);
      Object.assign(shader.uniforms, {
        waterHeights: { value: this.heightTexture },
        waterPhase: this.phase,
        waterShallow: { value: new Color(ENVIRONMENT_PALETTE.water_shallow) },
        waterDeep: { value: new Color(ENVIRONMENT_PALETTE.water_deep) },
        waterRipple: { value: new Color(ENVIRONMENT_PALETTE.water_foam) },
      });
      shader.vertexShader =
        `varying vec2 waterWorld;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
         waterWorld = (modelMatrix * vec4(position, 1.0)).xz;`,
        );
      shader.fragmentShader = `
        varying vec2 waterWorld;
        uniform sampler2D waterHeights;
        uniform float waterPhase;
        uniform vec3 waterShallow;
        uniform vec3 waterDeep;
        uniform vec3 waterRipple;
        float heightSample(vec2 cell) {
          return texture2D(waterHeights, (cell + 0.5) / ${WORLD.heightmapVertices.toFixed(1)}).r;
        }
        float bedHeight(vec2 world) {
          vec2 grid = clamp((world + ${(MAP_SIZE / 2).toFixed(1)}) / ${WORLD.heightmapSpacingM.toFixed(1)}, 0.0, ${(WORLD.heightmapVertices - 1).toFixed(1)});
          vec2 cell = min(floor(grid), vec2(${(WORLD.heightmapVertices - 2).toFixed(1)}));
          vec2 f = grid - cell;
          float a = heightSample(cell);
          float b = heightSample(cell + vec2(1.0, 0.0));
          float c = heightSample(cell + vec2(0.0, 1.0));
          float d = heightSample(cell + vec2(1.0, 1.0));
          // Match the terrain mesh's diagonal, including steep river banks.
          return f.x + f.y <= 1.0
            ? a + (b - a) * f.x + (c - a) * f.y
            : d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
        }
        ${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float depth = ${SEA_LEVEL.toFixed(1)} - bedHeight(waterWorld);
         if (depth <= ${WATER.dryCutoff}) discard;
         float blend = smoothstep(${WATER.shallowDepth.toFixed(1)}, ${WATER.deepDepth.toFixed(1)}, depth);
         vec3 waterColor = mix(waterShallow, waterDeep, blend);
         float ripple = sin(waterWorld.y * 6.2831853 / ${WATER.rippleScale.toFixed(1)} - waterPhase);
         float swell = sin((waterWorld.x + waterWorld.y) * 6.2831853 / ${WATER.swellScale.toFixed(1)} + 2.0 * waterPhase);
         float crest = pow(max(0.0, ripple * swell), 4.0) * ${WATER.rippleStrength};
         diffuseColor.rgb *= mix(waterColor, waterRipple, crest);
         diffuseColor.a *= mix(${WATER.shallowOpacity}, ${WATER.deepOpacity}, blend)
           * smoothstep(${WATER.dryCutoff}, 0.5, depth);`,
      );
    };
    this.material.customProgramCacheKey = () => 'webcity-water-v1';
    this.material.needsUpdate = true;
  }

  /** Advance flowing ripples with a bounded delta, and upload revised terrain only when needed. */
  update(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0)
      this.phase.value =
        (this.phase.value +
          Math.min(seconds, WATER.maxFrameSeconds) * WATER.angularSpeed) %
        (2 * Math.PI);
    if (this.revision !== this.terrain.revision) {
      this.revision = this.terrain.revision;
      this.heightTexture.needsUpdate = true;
    }
  }

  /** Release the owned texture, plane and shader material. */
  dispose(): void {
    this.heightTexture.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
