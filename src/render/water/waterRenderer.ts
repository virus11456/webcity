import {
  Color,
  DataTexture,
  FloatType,
  RGBAFormat,
  UnsignedByteType,
  RepeatWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  type Material,
} from 'three';
import { MAP_SIZE, SEA_LEVEL, WORLD } from '../../data/config';
import { ENVIRONMENT_PALETTE, WATER_PALETTE } from '../../data/palette';
import { WATER, WATER_DETAIL as D } from '../../data/water';
import type { Terrain } from '../../world/terrain';

import { waterNormalPixels } from '../../world/waterAppearance';
import type { SimEvent } from '../../bridge/protocol';

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
  private readonly normals = new DataTexture(
    waterNormalPixels(),
    D.normalSize,
    D.normalSize,
    RGBAFormat,
    UnsignedByteType,
  );
  private readonly pollution = new DataTexture(
    new Uint8Array(WORLD.fieldCells ** 2),
    WORLD.fieldCells,
    WORLD.fieldCells,
    RedFormat,
    UnsignedByteType,
  );
  private readonly river = new DataTexture(
    new Float32Array(WORLD.heightmapVertices),
    WORLD.heightmapVertices,
    1,
    RedFormat,
    FloatType,
  );
  private readonly phase = { value: 0 };
  private revision: number;

  constructor(private readonly terrain: Terrain) {
    this.normals.wrapS = this.normals.wrapT = RepeatWrapping;
    this.normals.minFilter = LinearMipmapLinearFilter;
    this.normals.magFilter = LinearFilter;
    this.normals.generateMipmaps = true;
    this.normals.needsUpdate = true;
    this.pollution.minFilter = this.pollution.magFilter = LinearFilter;
    this.pollution.needsUpdate = true;
    this.river.minFilter = this.river.magFilter = NearestFilter;
    this.river.image.data!.set(terrain.river);
    this.river.needsUpdate = true;
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
        waterNormals: { value: this.normals },
        waterPollution: { value: this.pollution },
        waterRiver: { value: this.river },
        waterSky: { value: new Color(ENVIRONMENT_PALETTE.sky_horizon) },
        waterDirty: { value: new Color(WATER_PALETTE.polluted) },
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
        uniform sampler2D waterNormals;
        uniform sampler2D waterPollution;
        uniform sampler2D waterRiver;
        uniform vec3 waterSky;
        uniform vec3 waterDirty;
        float riverCentre(float z) {
          float cell = clamp((z + ${(MAP_SIZE / 2).toFixed(1)}) / ${WORLD.heightmapSpacingM.toFixed(1)}, 0.0, ${(WORLD.heightmapVertices - 1).toFixed(1)});
          float a = floor(cell), b = min(a + 1.0, ${(WORLD.heightmapVertices - 1).toFixed(1)});
          return mix(texture2D(waterRiver, vec2((a+0.5)/${WORLD.heightmapVertices.toFixed(1)}, 0.5)).r,
            texture2D(waterRiver, vec2((b+0.5)/${WORLD.heightmapVertices.toFixed(1)}, 0.5)).r, fract(cell));
        }
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
        ${shader.fragmentShader}`
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
         float depth = ${SEA_LEVEL.toFixed(1)} - bedHeight(waterWorld);
         if (depth <= ${WATER.dryCutoff}) discard;
         float blend = smoothstep(${WATER.shallowDepth.toFixed(1)}, ${WATER.deepDepth.toFixed(1)}, depth);
         vec3 waterColor = mix(waterShallow, waterDeep, blend);
         vec2 stream = vec2(waterWorld.x - riverCentre(waterWorld.y), waterWorld.y);
         vec2 uv1 = stream / ${WATER.rippleScale.toFixed(1)} - vec2(0.0, waterPhase * ${D.flowMps.toFixed(2)} / ${WATER.rippleScale.toFixed(1)});
         vec2 uv2 = stream / ${WATER.swellScale.toFixed(1)} - vec2(waterPhase * 0.005, waterPhase * ${D.flowMps.toFixed(2)} / ${WATER.swellScale.toFixed(1)});
         vec3 ripple = texture2D(waterNormals, uv1).xyz * 2.0 - 1.0;
         vec3 swell = texture2D(waterNormals, uv2).xyz * 2.0 - 1.0;
         vec2 wave = (ripple.xy + swell.xy) * ${D.normalStrength.toFixed(2)};
         float flowSlope = (riverCentre(waterWorld.y + 8.0) - riverCentre(waterWorld.y - 8.0)) / 16.0;
         vec2 flow = normalize(vec2(flowSlope, 1.0));
         vec2 gradient = vec2(flow.y, -flow.x) * wave.x + flow * wave.y;
         vec3 waterSurfaceNormal = normalize(vec3(gradient.x, 1.0, gradient.y));
         vec3 view = normalize(cameraPosition - vec3(waterWorld.x, ${SEA_LEVEL.toFixed(1)}, waterWorld.y));
         float fresnel = ${D.fresnelBase.toFixed(2)} + (1.0 - ${D.fresnelBase.toFixed(2)}) * pow(1.0 - max(dot(view, waterSurfaceNormal), 0.0), 5.0);
         float pollution = texture2D(waterPollution, (waterWorld + ${(MAP_SIZE / 2).toFixed(1)}) / ${MAP_SIZE.toFixed(1)}).r;
         waterColor = mix(waterColor, waterDirty, pollution);
         waterColor = mix(waterColor, waterSky, fresnel * 0.8);
         float foamNoise = smoothstep(-0.2, 0.4, ripple.x + swell.y);
         float foam = (1.0 - smoothstep(${WATER.dryCutoff}, ${D.foamDepthM.toFixed(1)}, depth)) * foamNoise * ${D.foamOpacity.toFixed(2)};
         diffuseColor.rgb *= mix(waterColor, waterRipple, foam);
         diffuseColor.a *= mix(mix(${WATER.shallowOpacity}, ${WATER.deepOpacity}, blend), 1.0, fresnel)
           * smoothstep(${WATER.dryCutoff}, 0.5, depth);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        normal = normalize(mat3(viewMatrix) * waterSurfaceNormal);`,
        );
    };
    this.material.customProgramCacheKey = () => 'webcity-water-detail-v2';
    this.material.needsUpdate = true;
  }

  /** Advance flowing ripples with a bounded delta, and upload revised terrain only when needed. */
  update(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0)
      this.phase.value =
        (this.phase.value + Math.min(seconds, WATER.maxFrameSeconds)) %
        D.phasePeriodSeconds;
    if (this.revision !== this.terrain.revision) {
      this.revision = this.terrain.revision;
      this.heightTexture.needsUpdate = true;
    }
  }

  /** Consume authoritative pollution and river shape, including loaded saves. */
  accept(event: SimEvent): void {
    if (event.t === 'ready') {
      this.river.image.data!.set(event.snapshot.terrain.river);
      this.river.needsUpdate = true;
      this.setPollution(event.snapshot.fields.waterPollution);
    } else if (event.t === 'fields' && event.which === 'waterPollution')
      this.setPollution(event.data);
  }
  private setPollution(data: Float32Array): void {
    const pixels = this.pollution.image.data!;
    for (let i = 0; i < pixels.length; i++)
      pixels[i] = Math.round(
        Math.max(0, Math.min(1, (data[i] ?? 0) / D.pollutionMax)) * 255,
      );
    this.pollution.needsUpdate = true;
  }

  /** Release the owned texture, plane and shader material. */
  dispose(): void {
    this.heightTexture.dispose();
    this.normals.dispose();
    this.pollution.dispose();
    this.river.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
