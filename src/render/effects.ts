import {
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import type { SimEvent } from '../bridge/protocol';
import type { Building } from '../world/types';
import type { QualityLevel } from '../data/config';
import { CELL_SIZE } from '../data/config';
import { CITY_EFFECTS as E } from '../data/effects';
import { EFFECT_PALETTE as P } from '../data/palette';
interface Halo {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  age: number;
}
/** Two GPU-instanced batches: wind-drifting smoke and upward expanding upgrade rings. */
export class CityEffects {
  readonly group = new Group();
  private readonly records = new Map<number, Building>();
  private readonly emitters = new Map<number, Building>();
  private readonly halos: Halo[] = [];
  private readonly anchor = new Vector3();
  private quality: QualityLevel = 'high';
  private readonly smokeGeometry = new InstancedBufferGeometry();
  private readonly haloGeometry = new InstancedBufferGeometry();
  private readonly smokeAnchors = new InstancedBufferAttribute(
    new Float32Array(E.maxEmitters * E.smokePerEmitter.high * 3),
    3,
  );
  private readonly smokePhases = new InstancedBufferAttribute(
    new Float32Array(E.maxEmitters * E.smokePerEmitter.high),
    1,
  );
  private readonly haloAnchors = new InstancedBufferAttribute(
    new Float32Array(E.maxHalos * 3),
    3,
  );
  private readonly haloStates = new InstancedBufferAttribute(
    new Float32Array(E.maxHalos * 2),
    2,
  );
  private readonly smokeMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, tint: { value: new Color(P.smoke) } },
    vertexShader: `attribute vec3 anchor;attribute float phase;uniform float time;varying vec2 vUv;varying float life;
 void main(){vUv=uv;life=fract(time/${E.smokeLifeSeconds.toFixed(1)}+phase);vec3 p=anchor+vec3(${E.windXM.toFixed(1)}*life,${E.smokeRiseM.toFixed(1)}*life,${E.windZM.toFixed(1)}*life);vec4 eye=modelViewMatrix*vec4(p,1.);eye.xy+=position.xy*(1.+life*${(E.smokeRadiusM * 2).toFixed(1)});gl_Position=projectionMatrix*eye;}`,
    fragmentShader: `uniform vec3 tint;varying vec2 vUv;varying float life;void main(){float a=pow(max(0.,1.-length(vUv-.5)*2.),2.)*sin(life*3.14159)*.5;if(a<.005)discard;gl_FragColor=vec4(tint,a);}`,
  });
  private readonly haloMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { tint: { value: new Color(P.upgrade) } },
    vertexShader: `attribute vec3 anchor;attribute vec2 state;varying vec2 vUv;varying float life;void main(){vUv=uv;life=state.x;vec3 p=anchor;p.xz+=vec2(position.x,-position.y)*state.y*(1.+life*.5)*2.;p.y+=life*${E.haloRiseM.toFixed(1)};gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `uniform vec3 tint;varying vec2 vUv;varying float life;void main(){float radius=length(vUv-.5)*2.;float a=(1.-smoothstep(.05,.12,abs(radius-.8)))*(1.-life);if(a<.01)discard;gl_FragColor=vec4(tint,a);}`,
  });
  constructor(
    parent: Scene | Group,
    private readonly roof: (id: number, out: Vector3) => boolean,
    private readonly height: (x: number, z: number) => number,
  ) {
    const plane = new PlaneGeometry(1, 1);
    for (const [g, m] of [
      [this.smokeGeometry, this.smokeMaterial],
      [this.haloGeometry, this.haloMaterial],
    ] as const) {
      g.setIndex(plane.index);
      g.setAttribute('position', plane.getAttribute('position'));
      g.setAttribute('uv', plane.getAttribute('uv'));
      g.instanceCount = 0;
      const mesh = new Mesh(g, m);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    plane.dispose();
    this.smokeGeometry.setAttribute('anchor', this.smokeAnchors);
    this.smokeGeometry.setAttribute('phase', this.smokePhases);
    this.haloGeometry.setAttribute('anchor', this.haloAnchors);
    this.haloGeometry.setAttribute('state', this.haloStates);
    parent.add(this.group);
  }
  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    if (quality === 'low') {
      this.halos.length = 0;
      this.smokeGeometry.instanceCount = this.haloGeometry.instanceCount = 0;
    }
  }
  reset(buildings: readonly Building[]): void {
    this.records.clear();
    this.emitters.clear();
    this.halos.length = 0;
    for (const b of buildings) this.put(structuredClone(b));
  }
  private put(b: Building): void {
    this.records.set(b.id, b);
    if (
      b.enabled !== false &&
      b.state === 'active' &&
      !b.fire?.burning &&
      (b.defId === 'I' ||
        ['power_coal', 'power_oil', 'garbage_incinerator'].includes(b.defId))
    )
      this.emitters.set(b.id, b);
    else this.emitters.delete(b.id);
  }
  private locate(b: Building): void {
    if (this.roof(b.id, this.anchor)) return;
    const lx = b.lotW * CELL_SIZE * E.plantStackXFraction,
      lz = b.lotD * CELL_SIZE * E.plantStackZFraction,
      angle = b.rotation + Math.PI;
    const x = b.pos.x + lx * Math.cos(angle) + lz * Math.sin(angle),
      z = b.pos.z - lx * Math.sin(angle) + lz * Math.cos(angle);
    this.anchor.set(x, this.height(x, z) + E.fallbackStackM, z);
  }
  accept(event: SimEvent): void {
    if (event.t === 'ready') {
      this.reset(event.snapshot.buildings);
      return;
    }
    if (event.t !== 'buildingsChanged') return;
    for (const id of event.removed) {
      this.records.delete(id);
      this.emitters.delete(id);
      for (let i = this.halos.length - 1; i >= 0; i--)
        if (this.halos[i]!.id === id) this.halos.splice(i, 1);
    }
    for (const b of event.added) this.put(structuredClone(b));
    for (const patch of event.updated) {
      const previous = this.records.get(patch.id);
      if (!previous) continue;
      const b = { ...previous, ...structuredClone(patch) };
      if (
        this.quality !== 'low' &&
        b.state === 'active' &&
        b.level > 1 &&
        (previous.state === 'construction' || b.level > previous.level) &&
        this.halos.length < E.maxHalos
      ) {
        const depth = (b.lotD * CELL_SIZE) / 2;
        this.anchor.set(
          b.pos.x + Math.sin(b.rotation) * depth,
          0,
          b.pos.z + Math.cos(b.rotation) * depth,
        );
        this.halos.push({
          id: b.id,
          x: this.anchor.x,
          y: this.height(this.anchor.x, this.anchor.z),
          z: this.anchor.z,
          radius: Math.max(b.lotW, b.lotD) * CELL_SIZE * 0.6,
          age: 0,
        });
      }
      this.put(b);
    }
  }
  update(dt: number, camera: PerspectiveCamera): void {
    this.smokeMaterial.uniforms.time!.value += Math.max(0, dt);
    const per = E.smokePerEmitter[this.quality];
    let n = 0,
      sources = 0;
    if (per)
      for (const b of this.emitters.values()) {
        if (sources >= E.maxEmitters) break;
        this.locate(b);
        if (this.anchor.distanceToSquared(camera.position) > E.cullM ** 2)
          continue;
        for (let i = 0; i < per; i++) {
          this.smokeAnchors.setXYZ(
            n,
            this.anchor.x,
            this.anchor.y,
            this.anchor.z,
          );
          this.smokePhases.setX(n++, i / per + (b.seed % 97) / 97);
        }
        sources++;
      }
    this.smokeGeometry.instanceCount = n;
    if (n) {
      this.smokeAnchors.needsUpdate = true;
      this.smokePhases.needsUpdate = true;
    }
    let h = 0;
    for (let i = this.halos.length - 1; i >= 0; i--) {
      const halo = this.halos[i]!;
      halo.age += Math.max(0, dt);
      if (halo.age >= E.haloSeconds) {
        this.halos.splice(i, 1);
        continue;
      }
      this.haloAnchors.setXYZ(h, halo.x, halo.y + 0.1, halo.z);
      this.haloStates.setXY(h++, halo.age / E.haloSeconds, halo.radius);
    }
    this.haloGeometry.instanceCount = h;
    if (h) {
      this.haloAnchors.needsUpdate = true;
      this.haloStates.needsUpdate = true;
    }
  }
  readStats() {
    return {
      quality: this.quality,
      smoke: this.smokeGeometry.instanceCount,
      halos: this.haloGeometry.instanceCount,
      emitters: this.emitters.size,
      time: this.smokeMaterial.uniforms.time!.value as number,
    };
  }
  dispose(): void {
    this.group.removeFromParent();
    this.smokeGeometry.dispose();
    this.haloGeometry.dispose();
    this.smokeMaterial.dispose();
    this.haloMaterial.dispose();
    this.records.clear();
    this.emitters.clear();
    this.halos.length = 0;
  }
}
