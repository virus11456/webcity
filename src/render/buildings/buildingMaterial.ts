import { MeshStandardMaterial, type Material } from 'three';
import { BUILDING_DETAIL_PALETTE as P } from '../../data/palette';
import type { WindowAtlas } from './windowAtlas';

export type ShaderHook = Material['onBeforeCompile'];
/** Call after CSM setup, and again after changing shadow quality. */
export function installBuildingShader(
  material: Material,
  previous?: ShaderHook,
): void {
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.vertexShader =
      `attribute float buildingState; varying float buildingCondition;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nbuildingCondition = buildingState;',
      );
    shader.fragmentShader =
      `varying float buildingCondition;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      if (buildingCondition > 0.5) {
        float gray = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = vec3(gray * (buildingCondition > 1.5 ? 0.18 : 0.6));
      }`,
      );
  };
  material.customProgramCacheKey = () => 'building-condition-v1';
  material.needsUpdate = true;
}
export function buildingMaterial(atlas?: WindowAtlas): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: Boolean(atlas),
    map: atlas?.map ?? null,
    emissiveMap: atlas?.emissiveMap ?? null,
    emissive: P.windowLight,
    emissiveIntensity: 0,
    roughness: 0.85,
  });
  installBuildingShader(material);
  return material;
}
