import {
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
} from 'three';
import { Rng } from '../../core/rng';
import {
  ROAD_PALETTE as P,
  ENVIRONMENT_PALETTE as E,
} from '../../data/palette';
const size = 128,
  count = 8;
/** Original silhouette atlas, built once. No per-frame canvas or textures. */
export function vegetationBillboard(): {
  material: MeshStandardMaterial;
  texture: DataTexture;
} {
  const pixels = new Uint8Array(size * count * size * 4),
    rng = new Rng(309);
  const colors = [
    P.tree_leaf,
    E.grass_dark,
    P.median_grass,
    P.tree_leaf,
    E.grass_dark,
    P.median_grass,
    E.grass_dark,
    P.tree_leaf,
  ];
  for (let species = 0; species < count; species++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size - 0.5,
          v = (y + 0.5) / size;
        let leaf =
          species === 3 || species === 4
            ? Math.abs(u) < (1 - v) * 0.48 && v > 0.22
            : (u / 0.43) ** 2 + ((v - 0.67) / 0.3) ** 2 < 1;
        if (species === 5)
          leaf =
            Math.abs(v - 0.83 + Math.abs(u) * 0.2) < 0.05 && Math.abs(u) < 0.48;
        if (species >= 6) leaf = (u / 0.48) ** 2 + ((v - 0.46) / 0.44) ** 2 < 1;
        const trunk = species < 6 && Math.abs(u) < 0.028 && v < 0.82;
        if (!leaf && !trunk) continue;
        const c = parseInt(
            (leaf ? colors[species]! : P.tree_trunk).slice(1),
            16,
          ),
          shade = leaf ? 0.82 + rng.next() * 0.18 : 1;
        const i = (y * size * count + species * size + x) * 4;
        pixels[i] = ((c >> 16) & 255) * shade;
        pixels[i + 1] = ((c >> 8) & 255) * shade;
        pixels[i + 2] = (c & 255) * shade;
        pixels[i + 3] = 255;
      }
  const texture = new DataTexture(pixels, size * count, size);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const material = new MeshStandardMaterial({
    map: texture,
    alphaTest: 0.4,
    roughness: 0.9,
    side: DoubleSide,
  });
  return { material, texture };
}
export function installBillboard(
  material: Material,
  previous?: Material['onBeforeCompile'],
): void {
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 treeRight=normalize(vec3(viewMatrix[0][0],0.0,viewMatrix[2][0]));
      transformed=treeRight*position.x+vec3(0.0,position.y,0.0);
    `,
    );
  };
  material.customProgramCacheKey = () => 'vegetation-billboard-v1';
  material.needsUpdate = true;
}
