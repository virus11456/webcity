import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { terrainDetailPixels } from '../../world/terrainDetail';
import { TERRAIN_DETAIL as D } from '../../data/terrain';

/** One packed texture: three triplanar reads supply all four surface details. */
export function createTerrainDetailTexture(): DataTexture {
  const texture = new DataTexture(
    terrainDetailPixels(),
    D.size,
    D.size,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = 'webcity-terrain-detail';
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export const TERRAIN_DETAIL_GLSL = `
uniform sampler2D terrainDetail;
float terrainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float terrainVariation(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(terrainHash(i), terrainHash(i+vec2(1.0,0.0)), f.x),
    mix(terrainHash(i+vec2(0.0,1.0)), terrainHash(i+vec2(1.0)), f.x), f.y) * 2.0 - 1.0;
}
vec4 terrainSurfaceDetail(vec3 p, vec3 n) {
  vec3 weight = pow(abs(normalize(n)), vec3(${D.triplanarSharpness.toFixed(1)}));
  weight /= max(dot(weight, vec3(1.0)), 0.0001);
  p /= ${D.repeatM.toFixed(1)};
  return texture2D(terrainDetail, p.yz) * weight.x
    + texture2D(terrainDetail, p.xz) * weight.y
    + texture2D(terrainDetail, p.xy) * weight.z;
}
`;
