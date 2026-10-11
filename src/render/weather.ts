import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  type Material,
  type PerspectiveCamera,
} from 'three';
import { Rng } from '../core/rng';
import { WEATHER as W } from '../data/weather';
import { TIME, type QualityLevel } from '../data/config';
import { WEATHER_PALETTE } from '../data/palette';
import { weatherAt, type WeatherSample } from '../world/weather';
import type { SimClock } from '../world/snapshot';
/** One rain batch plus a uniform-only terrain shadow; paused clocks freeze both. */
export class Weather {
  enabled = true;
  readonly sample: WeatherSample = { kind: 'clear', rain: 0, fog: 0, cloud: 0 };
  readonly phase = { value: 0 };
  readonly cloud = { value: 0 };
  private ticks = 0;
  private speed = 0;
  private elapsed = 0;
  private geometry = new BufferGeometry();
  private material = new LineBasicMaterial({
    color: WEATHER_PALETTE.rain,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  readonly rain = new LineSegments(this.geometry, this.material);
  constructor(private seed: number) {
    const rng = new Rng(seed ^ W.seedSalt),
      points = new Float32Array(W.rainCount.high * 6),
      tails = new Float32Array(W.rainCount.high * 2);
    for (let i = 0; i < W.rainCount.high; i++) {
      const x = rng.float(-W.rainVolumeM / 2, W.rainVolumeM / 2),
        y = rng.float(0, W.rainHeightM),
        z = rng.float(-W.rainVolumeM / 2, W.rainVolumeM / 2);
      points.set([x, y, z, x + W.rainLengthM * W.rainSlant, y, z], i * 6);
    }
    for (let i = 0; i < W.rainCount.high; i++)
      tails[i * 2 + 1] = -W.rainLengthM;
    this.geometry.setAttribute(
      'rainTail',
      new Float32BufferAttribute(tails, 1),
    );
    this.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(points, 3),
    );
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.weatherTime = this.phase;
      shader.vertexShader =
        'uniform float weatherTime;\nattribute float rainTail;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
      transformed.y = mod(position.y - weatherTime * ${W.rainSpeedMps.toFixed(1)}, ${W.rainHeightM.toFixed(1)}) - ${(W.rainHeightM / 2).toFixed(1)} + rainTail;`,
        );
    };
    this.rain.frustumCulled = false;
    this.rain.visible = false;
  }
  setQuality(level: QualityLevel) {
    this.geometry.setDrawRange(0, W.rainCount[level] * 2);
  }
  accept(clock: SimClock) {
    this.ticks = clock.ticks;
    this.speed = clock.speed;
    this.elapsed = 0;
  }
  update(seconds: number, camera: PerspectiveCamera) {
    const step = TIME.secondsPerDay[1] / TIME.ticksPerDay;
    this.elapsed = Math.min(
      step,
      this.elapsed + Math.max(0, seconds) * this.speed,
    );
    const ticks = this.ticks + (this.speed ? this.elapsed / step : 0);
    this.phase.value = ticks * step;
    weatherAt(this.seed, ticks, this.sample);
    if (!this.enabled) {
      this.sample.kind = 'clear';
      this.sample.rain = this.sample.fog = this.sample.cloud = 0;
    }
    this.cloud.value = this.sample.cloud;
    this.material.opacity = this.sample.rain * W.rainOpacity;
    this.rain.visible = this.sample.rain > 0;
    this.rain.position.copy(camera.position);
  }
  installShadow(material: Material) {
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.weatherTime = this.phase;
      shader.uniforms.weatherCloud = this.cloud;
      shader.vertexShader =
        'varying vec2 weatherWorld;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        weatherWorld=(modelMatrix*vec4(position,1.0)).xz;`,
        );
      shader.fragmentShader =
        'varying vec2 weatherWorld;\nuniform float weatherTime;\nuniform float weatherCloud;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        vec2 cloudP=(weatherWorld+vec2(weatherTime*${W.cloudSpeedMps.toFixed(1)},weatherTime*${(W.cloudSpeedMps * W.cloudDriftZ).toFixed(1)}))/${W.cloudScaleM.toFixed(1)};
        float cloudMask=smoothstep(${W.cloudThresholds[0].toFixed(1)},${W.cloudThresholds[1].toFixed(1)},sin(cloudP.x)+cos(cloudP.y*${W.cloudScaleZ.toFixed(1)})*${W.cloudSecondWeight.toFixed(1)});
        diffuseColor.rgb*=1.0-weatherCloud*cloudMask*${W.cloudShade.toFixed(2)};`,
        );
    };
  }
  readState() {
    return {
      ...this.sample,
      enabled: this.enabled,
      phase: this.phase.value,
      particles: this.rain.visible ? this.geometry.drawRange.count / 2 : 0,
    };
  }
  dispose() {
    this.rain.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
