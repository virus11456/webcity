import type { Material } from 'three';

/** Per-building switch times from stable world origins; one uniform, no nightly rebuild. */
export function installNightWindows(
  material: Material,
  hour: { value: number },
  previous?: Material['onBeforeCompile'],
): void {
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.cityHour = hour;
    shader.vertexShader =
      `varying float windowSeed;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vec4 windowOrigin = vec4(0.0,0.0,0.0,1.0);
      #ifdef USE_INSTANCING
        windowOrigin = instanceMatrix * windowOrigin;
      #endif
      windowOrigin = modelMatrix * windowOrigin;
      windowSeed = fract(sin(dot(windowOrigin.xz,vec2(12.9898,78.233))) * 43758.5453);
    `,
      );
    const inactive = shader.fragmentShader.includes(
      'varying float buildingCondition',
    )
      ? 'if (buildingCondition > 0.5) totalEmissiveRadiance = vec3(0.0);'
      : '';
    shader.fragmentShader =
      `uniform float cityHour; varying float windowSeed;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      float windowHour = cityHour < 12.0 ? cityHour + 24.0 : cityHour;
      float switchOn = 18.0 + windowSeed * 0.9;
      float lightOn = smoothstep(switchOn, switchOn + 0.1, windowHour) * (1.0 - smoothstep(29.0,30.0,windowHour));
      float lateOff = windowSeed < 0.3 ? 1.0 - smoothstep(23.0 + windowSeed * 6.0,23.2 + windowSeed * 6.0,windowHour) : 1.0;
      totalEmissiveRadiance *= lightOn * lateOff;
      ${inactive}
    `,
      );
  };
  material.customProgramCacheKey = () => 'city-night-windows-v1';
  material.needsUpdate = true;
}
