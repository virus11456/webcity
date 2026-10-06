import {
  BoxGeometry,
  Color,
  Group,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
  type PerspectiveCamera,
  type Material,
  type Scene,
} from 'three';
import type { SimEvent } from '../../bridge/protocol';
import { BUILDING_RENDER as R } from '../../data/buildingRendering';
import {
  BUILDING_FORM as F,
  type BuildingVolume,
} from '../../data/buildingAppearance';
import { CELL_SIZE } from '../../data/config';
import { GROWTH, ZONES, type ZoneType } from '../../data/zones';
import {
  BUILDING_DETAIL_PALETTE as P,
  ENVIRONMENT_PALETTE as E,
} from '../../data/palette';
import type { Building } from '../../world/types';
import { constructionVisual } from '../../world/constructionVisual';
import { generateBuilding } from './generator';
import { ConstructionBuilding } from './construction';
import { createWindowAtlas, type WindowAtlas } from './windowAtlas';
import { InstancePool, geometryHash, sameGeometry } from './instancePool';
import {
  buildingMaterial,
  installBuildingShader,
  type ShaderHook,
} from './buildingMaterial';

type Change = Extract<SimEvent, { t: 'buildingsChanged' }>;
interface Shape {
  massing: BuildingVolume[];
  wall: string;
  height: number;
}
interface Entry {
  data: Building;
  shape: Shape;
  key: string;
  base: number;
  progress: number;
  from: number;
  target: number;
  blend: number;
  age: number;
  removed: boolean;
  removal: number;
  detail: boolean;
  pool?: InstancePool;
  construction?: ConstructionBuilding;
  materials?: Material[];
}
interface Dust {
  key: string;
  x: number;
  y: number;
  z: number;
  age: number;
  size: number;
}
export interface BuildingRendererOptions {
  heightAt(x: number, z: number): number;
  atlas?: WindowAtlas;
  registerMaterial?(
    material: Material,
    install?: (previous?: ShaderHook) => void,
  ): void;
  unregisterMaterial?(material: Material): void;
}
/** Read-only Worker event consumer. Rendering interpolation never commits world state. */
export class BuildingRenderer {
  readonly group = new Group();
  private readonly atlas: WindowAtlas;
  private readonly fullMaterial;
  private readonly farMaterial = buildingMaterial();
  private readonly scaffoldMaterial = new MeshBasicMaterial({
    color: P.scaffold,
    wireframe: true,
  });
  private readonly dustMaterial = new MeshBasicMaterial({
    color: E.dirt,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  private readonly far: InstancePool;
  private readonly scaffold: InstancePool;
  private readonly foundation: InstancePool;
  private readonly dustPool: InstancePool;
  private readonly entries = new Map<number, Entry>();
  private readonly authoritative = new Map<number, Building>();
  private readonly pending = new Map<number, Building | null>();
  private readonly pools = new Map<string, InstancePool>();
  private readonly candidates: Entry[] = [];
  private readonly distances: number[] = [];
  private readonly dust: Dust[] = [];
  private readonly matrix = new Matrix4();
  private readonly local = new Matrix4();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private readonly visual = constructionVisual(1);
  private lodAge = R.lodInterval as number;
  private dustId = 0;
  private disposed = false;
  private processed = 0;
  private maxWorkMs = 0;
  private night = false;
  constructor(
    parent: Scene | Group,
    private readonly options: BuildingRendererOptions,
  ) {
    this.atlas = options.atlas ?? createWindowAtlas();
    this.fullMaterial = buildingMaterial(this.atlas);
    for (const material of [this.fullMaterial, this.farMaterial])
      options.registerMaterial?.(material, (previous) =>
        installBuildingShader(material, previous),
      );
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.far = new InstancePool(this.group, box, this.farMaterial);
    this.foundation = new InstancePool(this.group, box, this.farMaterial);
    this.scaffold = new InstancePool(this.group, box, this.scaffoldMaterial);
    this.dustPool = new InstancePool(this.group, box, this.dustMaterial);
    this.scaffold.mesh.castShadow = this.dustPool.mesh.castShadow = false;
    box.dispose();
    parent.add(this.group);
  }
  accept(event: SimEvent): void {
    if (this.disposed) return;
    if (event.t === 'ready') this.reset(event.snapshot.buildings);
    else if (event.t === 'buildingsChanged') this.change(event);
    else if (event.t === 'roadsChanged' && event.terrain)
      for (const [id, b] of this.authoritative) this.pending.set(id, b);
  }
  reset(buildings: readonly Building[]): void {
    this.clear();
    for (const data of buildings) {
      const b = structuredClone(data);
      this.authoritative.set(b.id, b);
      this.pending.set(b.id, b);
    }
  }
  private change(event: Change): void {
    for (const id of event.removed) {
      this.authoritative.delete(id);
      this.pending.set(id, null);
    }
    for (const data of event.added) {
      const b = structuredClone(data);
      this.authoritative.set(b.id, b);
      this.pending.set(b.id, b);
    }
    for (const patch of event.updated) {
      const old = this.authoritative.get(patch.id);
      if (!old) continue;
      const b = { ...old, ...structuredClone(patch) };
      this.authoritative.set(b.id, b);
      this.pending.set(b.id, b);
    }
  }
  private apply(id: number, b: Building | null): void {
    const old = this.entries.get(id);
    if (!b) {
      if (old && !old.removed) {
        old.removed = true;
        old.removal = 0;
        this.emitDust(old);
      }
      return;
    }
    if (b.kind !== 'zoned' || !Object.hasOwn(ZONES, b.defId)) {
      if (old) this.release(old);
      this.entries.delete(id);
      return;
    }
    const recipe = `${b.defId}:${b.level}:${b.lotW}:${b.lotD}:${b.seed}`;
    const target =
      b.state === 'construction'
        ? Math.min(1, Math.max(0, b.stateTimer / GROWTH.constructionDays))
        : 1;
    if (old && old.key === recipe && !old.removed) {
      old.data = b;
      old.base = this.options.heightAt(b.pos.x, b.pos.z);
      if (target !== old.target) {
        old.from = old.progress;
        old.target = target;
        old.blend = 0;
      }
      // Active is authoritative completion: scaffolding disappears immediately.
      if (b.state !== 'construction') old.progress = old.from = old.target = 1;
      this.draw(old);
      return;
    }
    if (old) this.release(old);
    // The same generator executes the same seeded layout, skipping detail geometry work.
    const geometry = generateBuilding(
      b.defId as ZoneType,
      b.level,
      b.lotW,
      b.lotD,
      b.seed,
      false,
    );
    const massing = geometry.userData.massing as BuildingVolume[];
    const shape: Shape = {
      massing,
      wall: geometry.userData.wall as string,
      height: Math.max(...massing.map((v) => v.y + v.h)),
    };
    geometry.dispose();
    const entry: Entry = {
      data: b,
      shape,
      key: recipe,
      base: this.options.heightAt(b.pos.x, b.pos.z),
      progress: target,
      from: target,
      target,
      blend: 1,
      age: 0,
      removed: false,
      removal: 0,
      detail: false,
    };
    this.entries.set(id, entry);
    this.draw(entry);
    this.emitDust(entry);
    this.lodAge = R.lodInterval;
  }
  /** Flush bounded work, interpolate visual changes, then reconsider only a bounded near set. */
  update(seconds: number, camera?: PerspectiveCamera): void {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0, seconds));
    const start = performance.now();
    let operations = 0;
    for (const [id, data] of this.pending) {
      this.pending.delete(id);
      this.apply(id, data);
      this.processed++;
      if (
        ++operations >= R.operationsPerFrame ||
        performance.now() - start >= R.workBudgetMs
      )
        break;
    }
    this.maxWorkMs = Math.max(this.maxWorkMs, performance.now() - start);
    for (const [id, e] of this.entries) {
      if (e.removed) {
        e.removal += dt;
        if (e.removal >= R.demolitionSeconds) {
          this.release(e);
          this.entries.delete(id);
          continue;
        }
      }
      const animate =
        e.removed || e.age < R.placementSeconds || e.progress !== e.target;
      e.age += dt;
      if (e.progress !== e.target) {
        e.blend = Math.min(1, e.blend + dt / R.progressBlendSeconds);
        e.progress = e.from + (e.target - e.from) * e.blend;
      }
      if (animate) this.draw(e);
      e.construction?.update(dt);
    }
    this.updateDust(dt);
    this.lodAge += dt;
    if (camera && this.lodAge >= R.lodInterval && !this.pending.size) {
      this.lodAge = 0;
      this.chooseDetail(camera);
    }
  }
  private chooseDetail(view: PerspectiveCamera): void {
    const camera = view.position;
    // A narrow portrait frustum needs a farther camera for the same projected building size.
    const detailDistance = R.detailDistance / Math.min(1, view.aspect);
    this.candidates.length = this.distances.length = 0;
    for (const e of this.entries.values()) {
      if (e.removed) continue;
      const p = e.data.pos;
      const distance =
        (p.x - camera.x) ** 2 +
        (e.base + e.shape.height / 2 - camera.y) ** 2 +
        (p.z - camera.z) ** 2;
      if (distance > detailDistance ** 2) continue;
      let i = 0;
      while (i < this.distances.length && this.distances[i]! <= distance) i++;
      if (i >= R.detailLimit) continue;
      this.candidates.splice(i, 0, e);
      this.distances.splice(i, 0, distance);
      if (this.candidates.length > R.detailLimit) {
        this.candidates.pop();
        this.distances.pop();
      }
    }
    let construction = 0;
    for (let i = 0; i < this.candidates.length; i++) {
      const e = this.candidates[i]!;
      if (
        e.data.state === 'construction' &&
        ++construction > R.constructionDetailLimit
      )
        this.candidates.splice(i--, 1);
    }
    // Retire before acquiring: cache/pool memory cannot grow during camera travel.
    for (const e of this.entries.values())
      if (e.detail && !this.candidates.includes(e)) {
        this.dropDetail(e);
        this.draw(e);
      }
    // Generate only one detailed model per frame budget interval, avoiding a camera-jump spike.
    for (const e of this.candidates)
      if (!e.detail) {
        this.addDetail(e);
        this.draw(e);
        break;
      }
  }
  private addDetail(e: Entry): void {
    this.removeFar(e);
    const b = e.data;
    const geometry = generateBuilding(
      b.defId as ZoneType,
      b.level,
      b.lotW,
      b.lotD,
      b.seed,
    );
    e.detail = true;
    if (b.state === 'construction') {
      e.construction = new ConstructionBuilding(geometry, this.atlas);
      e.materials = [];
      e.construction.group.traverse((object) => {
        if ('material' in object) {
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials as Material[])
            if (!e.materials!.includes(material)) {
              e.materials!.push(material);
              this.options.registerMaterial?.(material);
            }
        }
      });
      this.group.add(e.construction.group);
      e.construction.setNight(this.night);
      return;
    }
    let hash = geometryHash(geometry);
    // Exact comparison prevents even a hash collision from sharing the wrong facade.
    while (
      this.pools.has(hash) &&
      !sameGeometry(this.pools.get(hash)!.mesh.geometry, geometry)
    )
      hash += ':';
    let pool = this.pools.get(hash);
    if (!pool) {
      pool = new InstancePool(this.group, geometry, this.fullMaterial);
      this.pools.set(hash, pool);
    }
    geometry.dispose();
    e.pool = pool;
  }
  private dropDetail(e: Entry): void {
    if (e.pool) {
      const pool = e.pool;
      pool.remove(String(e.data.id));
      if (!pool.count) {
        for (const [hash, p] of this.pools)
          if (p === pool) {
            this.pools.delete(hash);
            break;
          }
        pool.dispose();
      }
      e.pool = undefined;
    }
    if (e.construction) {
      for (const m of e.materials ?? []) this.options.unregisterMaterial?.(m);
      e.construction.dispose();
      e.construction = undefined;
      e.materials = undefined;
    }
    e.detail = false;
  }
  private draw(e: Entry): void {
    const b = e.data;
    if (e.construction && b.state !== 'construction') {
      this.dropDetail(e);
    }
    // An existing full-detail active model must also support returning to construction.
    if (e.pool && b.state === 'construction') this.dropDetail(e);
    const t = Math.min(1, e.age / R.placementSeconds);
    const bounce = e.removed
      ? 1
      : Math.max(0.001, 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2);
    const sink = e.removed
      ? (e.shape.height * e.removal) / R.demolitionSeconds
      : 0;
    this.matrix
      .makeRotationY(b.rotation)
      .scale(this.scale.set(bounce, bounce, bounce));
    this.matrix.setPosition(b.pos.x, e.base - sink, b.pos.z);
    const condition =
      b.state === 'burned' ? 2 : b.state === 'abandoned' ? 1 : 0;
    if (e.construction) {
      e.construction.group.matrixAutoUpdate = false;
      e.construction.group.matrix.copy(this.matrix);
      e.construction.group.matrixWorldNeedsUpdate = true;
      e.construction.setProgress(e.progress, e.base - sink);
    } else if (e.pool)
      e.pool.set(
        String(b.id),
        this.matrix,
        this.color.setRGB(1, 1, 1),
        condition,
      );
    else {
      const visual = constructionVisual(e.progress, this.visual);
      for (let i = 0; i < e.shape.massing.length; i++) {
        const v = e.shape.massing[i]!;
        const height =
          b.state === 'construction'
            ? Math.max(0, Math.min(v.h, e.shape.height * visual.facade - v.y))
            : v.h;
        const key = `${b.id}:${i}`;
        if (height > 0) {
          this.local
            .makeScale(v.w, height, v.d)
            .setPosition(v.x, v.y, v.z)
            .premultiply(this.matrix);
          this.far.set(
            key,
            this.local,
            this.color.set(e.shape.wall),
            condition,
          );
        } else this.far.remove(key);
      }
      const key = String(b.id);
      if (b.state === 'construction' && e.progress < 1) {
        this.local
          .makeScale(
            b.lotW * CELL_SIZE,
            F.construction.foundationHeight,
            b.lotD * CELL_SIZE,
          )
          .setPosition(0, 0, (-b.lotD * CELL_SIZE) / 2)
          .premultiply(this.matrix);
        this.foundation.set(key, this.local, this.color.set(E.dirt));
        if (e.progress > 0) {
          this.local
            .makeScale(
              b.lotW * CELL_SIZE,
              e.shape.height * visual.structure,
              b.lotD * CELL_SIZE,
            )
            .setPosition(0, 0, (-b.lotD * CELL_SIZE) / 2)
            .premultiply(this.matrix);
          this.scaffold.set(key, this.local, this.color.setRGB(1, 1, 1));
        } else this.scaffold.remove(key);
      } else {
        this.foundation.remove(key);
        this.scaffold.remove(key);
      }
    }
  }
  private removeFar(e: Entry): void {
    for (let i = 0; i < e.shape.massing.length; i++)
      this.far.remove(`${e.data.id}:${i}`);
    this.scaffold.remove(String(e.data.id));
    this.foundation.remove(String(e.data.id));
  }
  private release(e: Entry): void {
    this.dropDetail(e);
    this.removeFar(e);
  }
  private emitDust(e: Entry): void {
    if (this.dust.length + R.dustParticles > R.dustLimit) return;
    for (let i = 0; i < R.dustParticles; i++)
      this.dust.push({
        key: `dust:${this.dustId++}`,
        x: e.data.pos.x,
        y: e.base,
        z: e.data.pos.z - (e.data.lotD * CELL_SIZE) / 2,
        age: -i * 0.01,
        size: e.data.lotW,
      });
  }
  private updateDust(dt: number): void {
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const p = this.dust[i]!;
      p.age += dt;
      if (p.age >= R.dustSeconds) {
        this.dustPool.remove(p.key);
        this.dust.splice(i, 1);
        continue;
      }
      const t = Math.max(0, p.age / R.dustSeconds),
        angle = i * 2.39996,
        size = (1 - t) * p.size;
      this.matrix
        .makeScale(size, size, size)
        .setPosition(
          p.x + Math.cos(angle) * t * p.size * 3,
          p.y + t * 2,
          p.z + Math.sin(angle) * t * p.size * 3,
        );
      this.dustPool.set(p.key, this.matrix, this.color.setRGB(1, 1, 1));
    }
  }
  setNight(night: boolean): void {
    this.night = night;
    this.fullMaterial.emissiveIntensity = night ? 1.4 : 0;
    for (const e of this.entries.values()) e.construction?.setNight(night);
  }
  readStats() {
    let detail = 0,
      construction = 0,
      abandoned = 0,
      removing = 0;
    for (const e of this.entries.values()) {
      if (e.detail) detail++;
      if (e.data.state === 'construction') construction++;
      if (e.data.state === 'abandoned') abandoned++;
      if (e.removed) removing++;
    }
    return {
      buildings: this.entries.size,
      pending: this.pending.size,
      detail,
      construction,
      abandoned,
      removing,
      pools: this.pools.size,
      farInstances: this.far.count,
      scaffolds: this.scaffold.count,
      dust: this.dust.length,
      processed: this.processed,
      maxWorkMs: this.maxWorkMs,
    };
  }
  inspect(id: number) {
    const e = this.entries.get(id);
    return e
      ? {
          state: e.data.state,
          progress: e.progress,
          target: e.target,
          detail: e.detail,
          base: e.base,
          removed: e.removed,
          visual: e.construction?.readState() ?? constructionVisual(e.progress),
        }
      : null;
  }
  private clear(): void {
    for (const e of this.entries.values()) this.release(e);
    this.entries.clear();
    this.authoritative.clear();
    this.pending.clear();
    for (const p of this.dust) this.dustPool.remove(p.key);
    this.dust.length = 0;
    this.candidates.length = 0;
    this.distances.length = 0;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    for (const p of [this.far, this.scaffold, this.foundation, this.dustPool])
      p.dispose();
    for (const m of [
      this.fullMaterial,
      this.farMaterial,
      this.scaffoldMaterial,
      this.dustMaterial,
    ]) {
      this.options.unregisterMaterial?.(m);
      m.dispose();
    }
    if (!this.options.atlas) this.atlas.dispose();
    this.group.removeFromParent();
  }
}
