import {
  Color,
  Vector3,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Scene,
  type PerspectiveCamera,
} from 'three';
import type { Building } from '../world/types';
import type { SimEvent } from '../bridge/protocol';
import { FIRE as F } from '../data/fire';
import { FIRE_PALETTE as P } from '../data/palette';
import { CELL_SIZE } from '../data/config';
/** One instanced billboard batch; original procedural orange flame and rising black smoke. */
export class FireRenderer {
  readonly group = new Group();
  readonly geometry = new InstancedBufferGeometry();
  readonly material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      flame: { value: new Color(P.flame) },
      core: { value: new Color(P.core) },
      smoke: { value: new Color(P.smoke) },
    },
    vertexShader: `attribute vec3 anchor; attribute float phase; uniform float time; varying vec2 vUv; varying float vPhase;
      void main(){vUv=uv;vPhase=phase;vec4 p=modelViewMatrix*vec4(anchor,1.);p.xy+=vec2(position.x,uv.y)*vec2(${F.spriteWidthM.toFixed(1)},${(F.spriteHeightM + F.smokeHeightM).toFixed(1)});gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform float time;uniform vec3 flame;uniform vec3 core;uniform vec3 smoke;varying vec2 vUv;varying float vPhase;
      void main(){float y=vUv.y;float x=(vUv.x-.5)*2.;float t=time*3.+vPhase;
      float sway=sin(y*15.-t)*.12;float fireY=y*2.6;
      float width=max(.001,1.-fireY)*(.8+.15*sin(t*2.));
      float a=(1.-smoothstep(width*.45,width,abs(x+sway)))*(1.-smoothstep(.75,1.,fireY));
      vec3 c=mix(flame,core,max(0.,1.-abs(x)*3.-fireY));
      if(y>.34){float sy=(y-.34)/.66;float sx=x+sin(sy*9.-t*.4)*.18;float sw=.25+sy*.65;float sa=(1.-smoothstep(sw*.45,sw,abs(sx)))*sin(sy*3.14159)*.68; c=mix(c,smoke,clamp(sa*4.,0.,1.));a=max(a,sa);}
      if(a<.01)discard;gl_FragColor=vec4(c,a);}`,
  });
  private records = new Map<number, Building>();
  private burning = new Map<number, Building>();
  private anchors = new InstancedBufferAttribute(
    new Float32Array(F.maxSprites * 3),
    3,
  );
  private phases = new InstancedBufferAttribute(
    new Float32Array(F.maxSprites),
    1,
  );
  private readonly roofPoint = new Vector3();
  private disposed = false;
  private enabled = true;
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.geometry.instanceCount = 0;
  }
  readStats() {
    return { enabled: this.enabled, sprites: this.geometry.instanceCount };
  }
  constructor(
    parent: Scene | Group,
    private readonly height: (x: number, z: number) => number,
    private readonly roof?: (id: number, out: Vector3) => boolean,
  ) {
    const plane = new PlaneGeometry(1, 1);
    this.geometry.setIndex(plane.index);
    this.geometry.setAttribute('position', plane.getAttribute('position'));
    this.geometry.setAttribute('uv', plane.getAttribute('uv'));
    this.geometry.setAttribute('anchor', this.anchors);
    this.geometry.setAttribute('phase', this.phases);
    this.geometry.instanceCount = 0;
    plane.dispose();
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    parent.add(this.group);
  }
  reset(buildings: readonly Building[]): void {
    this.records.clear();
    this.burning.clear();
    for (const b of buildings) this.put(structuredClone(b));
  }
  private put(b: Building): void {
    this.records.set(b.id, b);
    if (b.state === 'active' && b.fire?.burning) this.burning.set(b.id, b);
    else this.burning.delete(b.id);
  }
  accept(e: SimEvent): void {
    if (e.t === 'ready') this.reset(e.snapshot.buildings);
    if (e.t !== 'buildingsChanged') return;
    for (const id of e.removed) {
      this.records.delete(id);
      this.burning.delete(id);
    }
    for (const b of e.added) this.put(structuredClone(b));
    for (const p of e.updated) {
      const b = this.records.get(p.id);
      if (b) this.put(Object.assign(b, structuredClone(p)));
    }
  }
  update(dt: number, camera: PerspectiveCamera): void {
    if (!this.enabled) {
      this.geometry.instanceCount = 0;
      return;
    }
    this.material.uniforms.time!.value += dt;
    let n = 0;
    for (const b of this.burning.values()) {
      if (n >= F.maxSprites) break;
      const depth = (b.lotD * CELL_SIZE) / 2,
        x = b.pos.x + Math.sin(b.rotation) * depth,
        z = b.pos.z + Math.cos(b.rotation) * depth;
      if (
        Math.hypot(camera.position.x - x, camera.position.z - z) >
        F.cullDistanceM
      )
        continue;
      if (this.roof?.(b.id, this.roofPoint)) {
        this.anchors.setXYZ(
          n,
          this.roofPoint.x,
          this.roofPoint.y - F.anchorHeightM,
          this.roofPoint.z,
        );
      } else {
        this.anchors.setXYZ(n, x, this.height(x, z) + F.anchorHeightM, z);
      }
      this.phases.setX(n, b.seed % F.phaseCycle);
      n++;
    }
    this.geometry.instanceCount = n;
    this.anchors.needsUpdate = true;
    this.phases.needsUpdate = true;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.records.clear();
    this.burning.clear();
  }
}
