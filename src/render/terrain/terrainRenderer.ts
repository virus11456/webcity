import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three';
import {
  CELL_SIZE,
  MAP_SIZE,
  SEA_LEVEL,
  TILE_SIZE,
  WORLD,
} from '../../data/config';
import { ENVIRONMENT_PALETTE, PWA_PALETTE } from '../../data/palette';
import { TERRAIN, TERRAIN_DETAIL as D } from '../../data/terrain';
import type { Terrain } from '../../world/terrain';

import {
  createTerrainDetailTexture,
  TERRAIN_DETAIL_GLSL,
} from './detailTexture';

/** 64-cell terrain chunks with a shared lit terrain shader and per-chunk frustum culling. */
export class TerrainRenderer {
  readonly group = new Group();
  readonly material = new MeshStandardMaterial({
    roughness: 1,
  });
  private readonly detail = createTerrainDetailTexture();
  private readonly geometries: BufferGeometry[] = [];
  private readonly boundaryMaterial = new LineBasicMaterial({
    color: PWA_PALETTE.skyline,
    transparent: true,
    opacity: 0.25,
  });
  constructor(readonly terrain: Terrain) {
    const step = WORLD.heightmapSpacingM,
      chunk = TERRAIN.chunkCells * CELL_SIZE,
      half = MAP_SIZE / 2;
    for (let z0 = -half; z0 < half; z0 += chunk)
      for (let x0 = -half; x0 < half; x0 += chunk) {
        const width = Math.min(chunk, half - x0),
          depth = Math.min(chunk, half - z0),
          nx = width / step + 1,
          nz = depth / step + 1;
        const positions: number[] = [],
          indices: number[] = [];
        for (let j = 0; j < nz; j++)
          for (let i = 0; i < nx; i++) {
            const x = x0 + i * step,
              z = z0 + j * step,
              h = terrain.heightAt(x, z);
            positions.push(x - x0, h, z - z0);
          }
        for (let j = 0; j < nz - 1; j++)
          for (let i = 0; i < nx - 1; i++) {
            const a = j * nx + i;
            indices.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
          }
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          'position',
          new Float32BufferAttribute(positions, 3),
        );
        geometry.setIndex(indices);
        this.updateNormals(geometry, x0, z0);
        geometry.computeBoundingSphere();
        this.geometries.push(geometry);
        const mesh = new Mesh(geometry, this.material);
        mesh.position.set(x0, 0, z0);
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    const lines: number[] = [];
    for (let border = -half + TILE_SIZE; border < half; border += TILE_SIZE)
      for (
        let p = -half;
        p < half;
        p += TERRAIN.boundaryDash + TERRAIN.boundaryGap
      ) {
        const end = Math.min(half, p + TERRAIN.boundaryDash);
        lines.push(
          border,
          Math.max(SEA_LEVEL, terrain.heightAt(border, p)) +
            TERRAIN.boundaryLift,
          p,
          border,
          Math.max(SEA_LEVEL, terrain.heightAt(border, end)) +
            TERRAIN.boundaryLift,
          end,
        );
        lines.push(
          p,
          Math.max(SEA_LEVEL, terrain.heightAt(p, border)) +
            TERRAIN.boundaryLift,
          border,
          end,
          Math.max(SEA_LEVEL, terrain.heightAt(end, border)) +
            TERRAIN.boundaryLift,
          border,
        );
      }
    const boundary = new BufferGeometry();
    boundary.setAttribute('position', new Float32BufferAttribute(lines, 3));
    this.geometries.push(boundary);
    this.group.add(new LineSegments(boundary, this.boundaryMaterial));
  }
  /** Refresh only chunks whose authoritative heights changed, including shared border vertices. */
  sync(): void {
    for (const child of this.group.children) {
      if (!(child instanceof Mesh)) continue;
      const geometry = child.geometry as BufferGeometry,
        position = geometry.getAttribute('position');
      let changed = false;
      for (let i = 0; i < position.count; i++) {
        const h = this.terrain.heightAt(
          position.getX(i) + child.position.x,
          position.getZ(i) + child.position.z,
        );
        if (position.getY(i) !== Math.fround(h)) {
          position.setY(i, h);
          changed = true;
        }
      }
      this.updateNormals(geometry, child.position.x, child.position.z);
      if (changed) {
        position.needsUpdate = true;
        geometry.computeBoundingSphere();
      }
    }
  }
  private updateNormals(
    geometry: BufferGeometry,
    x0: number,
    z0: number,
  ): void {
    const positions = geometry.getAttribute('position');
    let normals = geometry.getAttribute('normal');
    if (!normals) {
      normals = new Float32BufferAttribute(positions.count * 3, 3);
      geometry.setAttribute('normal', normals);
    }
    const step = WORLD.heightmapSpacingM;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) + x0,
        z = positions.getZ(i) + z0;
      const nx =
        this.terrain.heightAt(x - step, z) - this.terrain.heightAt(x + step, z);
      const nz =
        this.terrain.heightAt(x, z - step) - this.terrain.heightAt(x, z + step);
      const ny = step * 2,
        length = Math.hypot(nx, ny, nz);
      normals.setXYZ(i, nx / length, ny / length, nz / length);
    }
    normals.needsUpdate = true;
  }
  /** Compose terrain shading after the optional CSM hook, preserving Three lighting and fog. */
  installShader(lightingHook?: Material['onBeforeCompile']): void {
    this.material.onBeforeCompile = (shader, renderer) => {
      lightingHook?.call(this.material, shader, renderer);
      shader.uniforms.terrainDetail = { value: this.detail };
      for (const [name, color] of Object.entries(ENVIRONMENT_PALETTE))
        shader.uniforms[`terrain_${name}`] = { value: new Color(color) };
      shader.vertexShader =
        `varying vec3 terrainPosition; varying vec3 terrainNormal;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          terrainPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          terrainNormal = mat3(modelMatrix) * normal;`,
        );
      shader.fragmentShader = `
        varying vec3 terrainPosition;
        varying vec3 terrainNormal;
        ${TERRAIN_DETAIL_GLSL}
        uniform vec3 terrain_grass;
        uniform vec3 terrain_grass_dry;
        uniform vec3 terrain_dirt;
        uniform vec3 terrain_rock;
        uniform vec3 terrain_sand;
        ${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `
          #include <color_fragment>
          float terrainSlope = length(terrainNormal.xz) / max(terrainNormal.y, 0.001);
          float detailFade = 1.0 - smoothstep(${D.nearFadeM.toFixed(1)}, ${D.farFadeM.toFixed(1)}, distance(cameraPosition, terrainPosition));
          vec4 detail = mix(vec4(1.0), vec4(1.0) + (terrainSurfaceDetail(terrainPosition, terrainNormal) - 0.5) * ${D.contrast.toFixed(2)}, detailFade);
          vec3 terrainColor = mix(terrain_grass, terrain_grass_dry,
            clamp((terrainPosition.y - ${TERRAIN.dryHeight.toFixed(1)}) / 150.0, 0.0, 1.0)) * detail.r;
          terrainColor = mix(terrainColor, terrain_dirt * detail.g,
            smoothstep(${TERRAIN.dirtSlope}, ${TERRAIN.rockSlope}, terrainSlope));
          terrainColor = mix(terrainColor, terrain_rock * detail.b,
            smoothstep(${TERRAIN.rockSlope}, ${TERRAIN.rockSlope + 0.12}, terrainSlope));
          terrainColor = mix(terrain_sand * detail.a, terrainColor,
            smoothstep(${(SEA_LEVEL + TERRAIN.shoreHeight - 1).toFixed(1)},
              ${(SEA_LEVEL + TERRAIN.shoreHeight + 1).toFixed(1)}, terrainPosition.y));
          float terrainNoise = terrainVariation(terrainPosition.xz / ${D.variationSmallM.toFixed(1)}) * ${D.variationSmall.toFixed(2)}
            + terrainVariation(terrainPosition.xz / ${D.variationLargeM.toFixed(1)}) * ${D.variationLarge.toFixed(2)};
          terrainColor *= 1.0 + terrainNoise;
          if (max(abs(terrainPosition.x), abs(terrainPosition.z)) > ${(TILE_SIZE / 2).toFixed(1)}) {
            float luma = dot(terrainColor, vec3(0.2126, 0.7152, 0.0722));
            terrainColor = mix(vec3(luma), terrainColor, ${TERRAIN.lowSaturation}) * ${TERRAIN.lowBrightness};
          }
          diffuseColor.rgb *= terrainColor;
        `,
      );
    };
    this.material.customProgramCacheKey = () => 'webcity-terrain-detail-v2';
    this.material.needsUpdate = true;
  }
  /** Release chunk buffers and shared materials. */
  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.detail.dispose();
    this.material.dispose();
    this.boundaryMaterial.dispose();
    this.group.clear();
  }
}
