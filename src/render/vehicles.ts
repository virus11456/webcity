import { VEHICLE_MODELS } from '../data/vehicleModels';
import { vehicleModelIndex } from '../world/vehicleModels';
import { formalVehicleGeometry } from './vehicleModels/geometry';
import { vehicleLods } from './vehicleModels/load';
import { AssetLibrary } from './assets';
import { ShaderChunk, type WebGLRenderer } from 'three';
import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Camera,
  type Material,
  type Scene,
} from 'three';
import { LightGlows } from './lightGlows';
import { DAY_NIGHT as D } from '../data/dayNight';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLE_APPEARANCE as C } from '../data/vehicleAppearance';
import { SERVICE_PALETTE, VEHICLE_PALETTE as P } from '../data/palette';
import { TRAFFIC_RUNTIME, TrafficKind } from '../data/traffic';
import type { SimEvent } from '../bridge/protocol';
interface Agent {
  id: number;
  citizenId: number;
  destinationId: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  ax: number;
  ay: number;
  az: number;
  aa: number;
  bx: number;
  by: number;
  bz: number;
  ba: number;
  elapsed: number;
  duration: number;
  seen: number;
  visible: boolean;
  color: Color;
}
export function vehicleColor(id: number, kind: number): string {
  if (kind === TrafficKind.pedestrian) return P.clothes[id % P.clothes.length]!;
  if (kind === TrafficKind.police) return SERVICE_PALETTE.police;
  if (kind === TrafficKind.fire) return SERVICE_PALETTE.fire;
  if (kind === TrafficKind.ambulance) return SERVICE_PALETTE.health;
  if (kind === TrafficKind.garbage) return P.paint[5];
  if (kind === TrafficKind.hearse) return P.paint[1];
  let roll = (Math.imul(id, 2654435761) >>> 0) % 100;
  for (let i = 0; i < C.weights.length; i++) {
    roll -= C.weights[i]!;
    if (roll < 0) return P.paint[i]!;
  }
  return P.paint[0];
}
/** Original procedural meshes. Every kind/LOD is a single vertex-colored geometry. */
export function vehicleGeometry(kind: number, lod: boolean): BufferGeometry {
  const parts: BufferGeometry[] = [],
    color = new Color();
  const part = (geometry: BufferGeometry, hex: string, x = 0, y = 0, z = 0) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    color.set(hex);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    parts.push(g);
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    hex: string,
  ) => part(new BoxGeometry(w, h, d), hex, x, y + h / 2, z);
  if (kind === TrafficKind.pedestrian) {
    part(new CapsuleGeometry(0.17, 0.75, 2, 6), P.paint[0], 0, 0.92, 0);
    part(new SphereGeometry(0.16, 6, 4), P.skin, 0, 1.58, 0);
    box(-0.12, 0, 0, 0.15, 0.62, 0.19, P.rubber);
    box(0.12, 0, 0, 0.15, 0.62, 0.19, P.rubber);
  } else {
    const [w, h, d] =
      kind === TrafficKind.bus
        ? C.bus
        : kind === TrafficKind.truck || kind === TrafficKind.garbage
          ? C.truck
          : C.car;
    box(0, 0.3, 0, w, h * 0.48, d, P.paint[0]);
    box(0, h * 0.48 + 0.3, -d * 0.07, w * 0.83, h * 0.36, d * 0.53, P.glass);
    box(0, h * 0.84 + 0.3, -d * 0.07, w * 0.85, 0.1, d * 0.54, P.paint[0]);
    if (!lod) {
      for (const x of [-w / 2, w / 2])
        for (const z of [-d * 0.3, d * 0.3]) {
          const wheel = new CylinderGeometry(0.32, 0.32, 0.18, 8);
          wheel.rotateZ(Math.PI / 2);
          part(wheel, P.rubber, x, 0.32, z);
        }
      for (const x of [-w * 0.3, w * 0.3]) {
        box(x, 0.6, d / 2, 0.32, 0.2, 0.05, P.headlight);
        box(x, 0.6, -d / 2, 0.32, 0.2, 0.05, P.taillight);
      }
      if (kind >= TrafficKind.police && kind <= TrafficKind.ambulance)
        box(0, h + 0.08, 0, w * 0.62, 0.18, 0.3, SERVICE_PALETTE.police);
    }
  }
  const geometry = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}
/** 50 ms wire frames feed a fixed-capacity renderer; interpolation never creates or merges trips. */
export class VehicleRenderer {
  readonly group = new Group();
  readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
  });
  private readonly frontGlow = new LightGlows(
    C.capacity * 2,
    P.headlight,
    D.vehicleGlowM,
    true,
  );
  private readonly rearGlow = new LightGlows(
    C.capacity * 2,
    P.taillight,
    D.vehicleGlowM,
    true,
  );
  private night = 0;
  setNight(value: number): void {
    this.night = value;
    this.frontGlow.setNight(value);
    this.rearGlow.setNight(value);
  }
  private readonly meshes: InstancedMesh[] = [];
  private readonly agents = new Map<number, Agent>();
  private sequence = 0;
  private tick = -1;
  private simSpeed = 1;
  private readonly matrix = new Matrix4();
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly projection = new Vector3();
  private readonly counts = new Uint16Array(34);
  private library?: AssetLibrary;
  private disposed = false;
  private loaded = 0;
  constructor(
    private readonly scene: Scene,
    register?: (
      m: Material,
      install?: (previous?: Material['onBeforeCompile']) => void,
    ) => void,
    private readonly unregister?: (
      m: Material,
      install?: (previous?: Material['onBeforeCompile']) => void,
    ) => void,
    renderer?: WebGLRenderer,
  ) {
    this.group.name = 'citizen-traffic';
    for (let model = 0; model <= VEHICLE_MODELS.length; model++)
      for (let lod = 0; lod < 2; lod++) {
        const mesh = new InstancedMesh(
          model < VEHICLE_MODELS.length
            ? formalVehicleGeometry(VEHICLE_MODELS[model]!, lod as 0 | 1)
            : vehicleGeometry(TrafficKind.pedestrian, !!lod),
          this.material,
          C.capacity,
        );
        if (!mesh.geometry.getAttribute('_paint'))
          mesh.geometry.setAttribute(
            '_paint',
            new Float32BufferAttribute(
              new Float32Array(
                mesh.geometry.getAttribute('position').count,
              ).fill(1),
              1,
            ),
          );
        mesh.setColorAt(0, new Color(P.paint[0]));
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.meshes.push(mesh);
        this.group.add(mesh);
      }
    this.group.add(this.frontGlow.mesh, this.rearGlow.mesh);
    scene.add(this.group);
    const install = (previous?: Material['onBeforeCompile']) => {
      this.material.onBeforeCompile = (shader, renderer) => {
        previous?.call(this.material, shader, renderer);
        shader.vertexShader =
          'attribute float _paint;\n' +
          shader.vertexShader.replace(
            '#include <color_vertex>',
            ShaderChunk.color_vertex.replace(
              'vColor.rgb *= instanceColor.rgb;',
              'vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, _paint);',
            ),
          );
      };
      this.material.customProgramCacheKey = () => 'vehicle-paint-mask-v1';
    };
    if (register) register(this.material, install);
    else install();
    if (renderer) {
      this.library = new AssetLibrary(renderer);
      VEHICLE_MODELS.forEach((model, index) => {
        void this.library!.load(model.id)
          .then((root) => {
            if (this.disposed) return;
            const geometries = vehicleLods(root);
            geometries.forEach((g, lod) => {
              const mesh = this.meshes[index * 2 + lod]!;
              mesh.geometry.dispose();
              mesh.geometry = g;
            });
            this.loaded++;
          })
          .catch(() => {
            /* Authored fallback keeps traffic visible offline. */
          });
      });
    }
  }
  accept(event: SimEvent): void {
    if (event.t === 'ready') {
      this.clear();
      return;
    }
    if (event.t !== 'vehicles') return;
    const tick = event.tick ?? this.tick + 1;
    if (tick === this.tick && (event.speed ?? 1) === this.simSpeed) return;
    const duration = Math.min(
      C.maximumInterpolationSeconds,
      Math.max(
        0,
        ((tick - this.tick) * C.defaultStepSeconds) /
          Math.max(1, event.speed ?? 1),
      ),
    );
    this.simSpeed = event.speed ?? 1;
    this.tick = tick;
    this.sequence++;
    const data = event.data;
    for (let i = 0; i < Math.min(event.count, C.capacity); i++) {
      const o = i * TRAFFIC_RUNTIME.streamStride,
        id = data[o]!,
        kind = data[o + 2]!;
      if (o + 9 >= data.length || kind < 0 || kind > 8) continue;
      let a = this.agents.get(id);
      if (!a) {
        a = {
          id,
          citizenId: data[o + 1]!,
          destinationId: data[o + 9]!,
          kind,
          x: data[o + 3]!,
          y: data[o + 4]!,
          z: data[o + 5]!,
          yaw: data[o + 6]!,
          speed: data[o + 7]!,
          ax: 0,
          ay: 0,
          az: 0,
          aa: 0,
          bx: 0,
          by: 0,
          bz: 0,
          ba: 0,
          elapsed: 0,
          duration: 0,
          seen: 0,
          visible: false,
          color: new Color(vehicleColor(data[o + 1]!, kind)),
        };
        this.agents.set(id, a);
      }
      if (a.citizenId !== data[o + 1] || a.kind !== kind) {
        a.citizenId = data[o + 1]!;
        a.kind = kind;
        a.color.set(vehicleColor(a.citizenId, kind));
      }
      a.ax = a.x;
      a.ay = a.y;
      a.az = a.z;
      a.aa = a.yaw;
      a.bx = data[o + 3]!;
      a.by = data[o + 4]!;
      a.bz = data[o + 5]!;
      a.ba = data[o + 6]!;
      a.speed = data[o + 7]!;
      a.destinationId = data[o + 9]!;
      a.elapsed = 0;
      a.duration = this.simSpeed ? duration : 0;
      a.seen = this.sequence;
    }
    for (const [id, a] of this.agents)
      if (a.seen !== this.sequence) this.agents.delete(id);
  }
  update(seconds: number, camera: Camera): void {
    this.counts.fill(0);
    let glowCount = 0;
    for (const a of this.agents.values()) {
      a.elapsed += seconds;
      const t = a.duration ? Math.min(1, a.elapsed / a.duration) : 1;
      a.x = a.ax + (a.bx - a.ax) * t;
      a.y = a.ay + (a.by - a.ay) * t;
      a.z = a.az + (a.bz - a.az) * t;
      const delta = Math.atan2(Math.sin(a.ba - a.aa), Math.cos(a.ba - a.aa));
      a.yaw = a.aa + delta * t;
      const distance =
        (a.x - camera.position.x) ** 2 +
        (a.y - camera.position.y) ** 2 +
        (a.z - camera.position.z) ** 2;
      const limit =
        a.kind === TrafficKind.pedestrian ? C.pedestrianCullM : C.cullM;
      a.visible = distance < limit * limit;
      if (!a.visible) continue;
      const meshId =
          vehicleModelIndex(a.citizenId, a.kind) * 2 +
          (distance > C.lodM * C.lodM ? 1 : 0),
        mesh = this.meshes[meshId]!,
        index = this.counts[meshId]!;
      this.position.set(a.x, a.y + C.roadLiftM, a.z);
      this.rotation.setFromAxisAngle(this.up, a.yaw);
      this.matrix.compose(this.position, this.rotation, this.scale);
      mesh.setMatrixAt(index, this.matrix);
      mesh.setColorAt(index, a.color);
      this.counts[meshId] = index + 1;
      if (
        this.night > 0 &&
        a.kind !== TrafficKind.pedestrian &&
        glowCount < C.capacity * 2
      ) {
        const size =
          a.kind === TrafficKind.bus
            ? C.bus
            : a.kind === TrafficKind.truck ||
                a.kind === TrafficKind.garbage ||
                a.kind === TrafficKind.fire
              ? C.truck
              : C.car;
        const sin = Math.sin(a.yaw),
          cos = Math.cos(a.yaw);
        for (let side = -1; side <= 1; side += 2) {
          const dx = side * size[0]! * 0.3,
            dz = size[2]! / 2;
          this.matrix.makeTranslation(
            a.x + dx * cos + dz * sin,
            a.y + 0.8,
            a.z + dz * cos - dx * sin,
          );
          this.frontGlow.mesh.setMatrixAt(glowCount, this.matrix);
          this.matrix.makeTranslation(
            a.x + dx * cos - dz * sin,
            a.y + 0.8,
            a.z - dz * cos - dx * sin,
          );
          this.rearGlow.mesh.setMatrixAt(glowCount++, this.matrix);
        }
      }
    }
    this.frontGlow.mesh.count = this.rearGlow.mesh.count = glowCount;
    if (glowCount)
      this.frontGlow.mesh.instanceMatrix.needsUpdate =
        this.rearGlow.mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i]!;
      m.count = this.counts[i]!;
      m.visible = m.count > 0;
      if (m.count) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }
  pick(
    x: number,
    y: number,
    width: number,
    height: number,
    camera: Camera,
  ): number | null {
    let result: number | null = null,
      best = C.pickRadiusPx * C.pickRadiusPx;
    for (const a of this.agents.values())
      if (a.visible) {
        this.projection.set(a.x, a.y + 0.8, a.z).project(camera);
        const dx = ((this.projection.x + 1) * width) / 2 - x,
          dy = ((1 - this.projection.y) * height) / 2 - y,
          d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          result = a.id;
        }
      }
    return result;
  }
  /** Copy the actual interpolated pose into reusable storage for camera tracking. */
  copyPosition(id: number, out: { x: number; y: number; z: number }): boolean {
    const a = this.agents.get(id);
    if (!a) return false;
    out.x = a.x;
    out.y = a.y;
    out.z = a.z;
    return true;
  }
  sample(
    id: number,
  ): Readonly<
    Pick<
      Agent,
      | 'id'
      | 'citizenId'
      | 'destinationId'
      | 'kind'
      | 'x'
      | 'y'
      | 'z'
      | 'yaw'
      | 'speed'
      | 'visible'
    >
  > | null {
    const a = this.agents.get(id);
    return a
      ? {
          id: a.id,
          citizenId: a.citizenId,
          destinationId: a.destinationId,
          kind: a.kind,
          x: a.x,
          y: a.y,
          z: a.z,
          yaw: a.yaw,
          speed: a.speed,
          visible: a.visible,
        }
      : null;
  }
  samples(limit = 20) {
    const result: NonNullable<ReturnType<VehicleRenderer['sample']>>[] = [];
    for (const a of this.agents.values()) {
      if (result.length >= limit) break;
      result.push(this.sample(a.id)!);
    }
    return result;
  }
  stats() {
    return {
      modelsLoaded: this.loaded,
      agents: this.agents.size,
      lightPairs: this.frontGlow.mesh.count,
      visible: this.counts.reduce((a, b) => a + b, 0),
      batches: this.meshes.filter((m) => m.count > 0).length,
    };
  }
  clear(): void {
    this.agents.clear();
    this.tick = -1;
    this.counts.fill(0);
    for (const m of this.meshes) m.count = 0;
    this.frontGlow.mesh.count = this.rearGlow.mesh.count = 0;
  }
  dispose(): void {
    this.disposed = true;
    this.library?.dispose();
    this.scene.remove(this.group);
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
    this.frontGlow.dispose();
    this.rearGlow.dispose();
    this.unregister?.(this.material);
    this.material.dispose();
    this.clear();
  }
}
