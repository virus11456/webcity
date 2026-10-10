import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  type Material,
} from 'three';
import { ROAD_DETAIL as D } from '../../data/roadDetail';
import { ROAD_PALETTE as P } from '../../data/palette';
import { roadDetailPixels } from '../../world/roadDetail';

export function createRoadDetailTexture(): DataTexture {
  const texture = new DataTexture(roadDetailPixels(), D.size, D.size);
  texture.name = 'webcity-road-surfaces';
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
/** Compose after the CSM hook; only asphalt and paving change, never painted markings. */
export function installRoadDetail(
  material: Material,
  texture: DataTexture,
  previous?: Material['onBeforeCompile'],
): void {
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.roadDetail = { value: texture };
    shader.uniforms.asphaltColor = { value: new Color(P.asphalt) };
    shader.uniforms.sidewalkColor = { value: new Color(P.sidewalk) };
    shader.vertexShader =
      `varying vec3 roadPosition; varying vec2 roadSurface; uniform vec3 asphaltColor; uniform vec3 sidewalkColor;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      roadPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      roadSurface = vec2(1.0-step(0.001,distance(color,asphaltColor)),1.0-step(0.001,distance(color,sidewalkColor)));
    `,
      );
    shader.fragmentShader =
      `varying vec3 roadPosition; varying vec2 roadSurface; uniform sampler2D roadDetail;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 surface = texture2D(roadDetail,roadPosition.xz/${D.repeatM.toFixed(1)}).rg;
      float detailFade = 1.0-smoothstep(${D.fadeStartM.toFixed(1)},${D.fadeEndM.toFixed(1)},distance(cameraPosition,roadPosition));
      float variation = roadSurface.x*(surface.r-0.5)*${D.asphaltContrast} + roadSurface.y*(surface.g-0.7)*${D.pavingContrast};
      diffuseColor.rgb *= 1.0 + variation*detailFade;
    `,
      );
  };
  material.customProgramCacheKey = () => 'road-surfaces-v1';
  material.needsUpdate = true;
}
