import { CITY_EFFECTS as FX } from '../../data/effects';
import { catalogGeometry } from './catalogGeometry';
import {
  buildingLod,
  distantMassing,
  type BuildingLod,
} from '../../world/buildingLod';
import { BUILDING_LOD as L } from '../../data/buildingRendering';
import {
  catalogModel,
  type CatalogModel,
  visualSeed,
} from '../../world/modelCatalog';
import type { CatalogAssets } from './catalogAssets';
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
import { installNightWindows } from '../nightWindows';
import { DAY_NIGHT } from '../../data/dayNight';
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
  asset?: boolean;
  model?: CatalogModel;
  lod: BuildingLod;
  refresh?: boolean;
  fadeAge: number;
  previousPool?: InstancePool;
  previousFar?: boolean;
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
  assets?: Pick<CatalogAssets, 'request'>;
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
  private readonly catalogMaterials = new Set<Material>();
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
  private infoColors: ReadonlyMap<number, string> | null = null;
  private readonly pending = new Map<number, Building | null>();
  private readonly pools = new Map<string, InstancePool>();
  private readonly lodQueue = new Map<Entry, BuildingLod>();
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
  private readonly hour = { value: 12 };
  private effectsEnabled = true;
  setEffects(enabled: boolean): void {
    if (this.effectsEnabled === enabled) return;
    this.effectsEnabled = enabled;
    if (!enabled) {
      for (const d of this.dust) this.dustPool.remove(d.key);
      this.dust.length = 0;
    }
    for (const e of this.entries.values()) {
      e.construction?.setEffects(enabled);
      if (!enabled && e.removed) e.removal = R.demolitionSeconds;
      this.draw(e);
    }
    this.scaffold.mesh.visible = enabled;
  }
  private focusedId: number | undefined;
  /** Keep the building selected by the inspection control inside the existing detail budget. */
  focus(id: number): void {
    this.focusedId = id;
    this.lodAge = R.lodInterval;
  }
  constructor(
    parent: Scene | Group,
    private readonly options: BuildingRendererOptions,
  ) {
    this.atlas = options.atlas ?? createWindowAtlas();
    this.fullMaterial = buildingMaterial(this.atlas);
    for (const material of [this.fullMaterial, this.farMaterial]) {
      material.userData.infoRole = 'instance';
      const install = (previous?: ShaderHook) => {
        installBuildingShader(material, previous);
        if (material === this.fullMaterial)
          installNightWindows(material, this.hour, material.onBeforeCompile);
      };
      install();
      options.registerMaterial?.(material, install);
    }
    this.fullMaterial.emissiveIntensity = DAY_NIGHT.windowIntensity;
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
        old.removal = this.effectsEnabled ? 0 : R.demolitionSeconds;
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
      this.options.assets ? visualSeed(b) : b.seed,
      false,
    );
    const massing = geometry.userData.massing as BuildingVolume[];
    const shape: Shape = {
      massing: this.options.assets
        ? distantMassing(massing, ['RH', 'CH', 'O'].includes(b.defId))
        : massing,
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
      lod: 2,
      fadeAge: L.transitionSeconds,
      model: this.options.assets ? catalogModel(b) : undefined,
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
        e.removed ||
        e.age < R.placementSeconds ||
        e.progress !== e.target ||
        e.fadeAge < L.transitionSeconds;
      if (e.fadeAge < L.transitionSeconds) {
        e.fadeAge = Math.min(L.transitionSeconds, e.fadeAge + dt);
        if (e.fadeAge === L.transitionSeconds) this.finishFade(e);
      }
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
    this.flushLod();
    this.scaffold.mesh.visible = this.effectsEnabled;
  }
  private chooseDetail(view: PerspectiveCamera): void {
    if (this.options.assets) {
      this.chooseCatalogLod(view);
      return;
    }
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
      const priority = e.data.id === this.focusedId ? -1 : distance;
      let i = 0;
      while (i < this.distances.length && this.distances[i]! <= priority) i++;
      if (i >= R.detailLimit) continue;
      this.candidates.splice(i, 0, e);
      this.distances.splice(i, 0, priority);
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
  private chooseCatalogLod(view: PerspectiveCamera): void {
    let construction = 0;
    for (const e of this.entries.values()) {
      if (e.removed) continue;
      const p = e.data.pos,
        distance = Math.hypot(
          p.x - view.position.x,
          e.base + e.shape.height / 2 - view.position.y,
          p.z - view.position.z,
        );
      let lod = buildingLod(distance, e.lod);
      if (e.data.state === 'construction') {
        if (distance < L.nearM && construction++ < R.constructionDetailLimit)
          lod = 0;
        else lod = 2;
      }
      if (!e.model && lod === 1) lod = 2;
      if (e.lod !== lod || (e.refresh && lod < 2) || (lod < 2 && !e.detail))
        this.lodQueue.set(e, lod);
      else this.lodQueue.delete(e);
    }
  }
  private flushLod(): void {
    const start = performance.now();
    let operations = 0;
    for (const [e, lod] of this.lodQueue) {
      this.lodQueue.delete(e);
      if (this.entries.get(e.data.id) !== e || e.removed) continue;
      this.finishFade(e);
      const old = e.pool,
        wasFar = !e.detail;
      if (e.construction || e.data.state === 'construction') this.dropDetail(e);
      else {
        e.pool = undefined;
        e.detail = false;
      }
      e.lod = lod;
      e.refresh = false;
      if (lod !== 2) this.addDetail(e, lod);
      if (e.data.state !== 'construction') {
        e.previousPool = old === e.pool ? undefined : old;
        e.previousFar = wasFar && lod < 2;
        e.fadeAge = old === e.pool && !e.previousFar ? L.transitionSeconds : 0;
      }
      this.draw(e);
      if (
        ++operations >= L.operationsPerFrame ||
        performance.now() - start >= L.workBudgetMs
      )
        break;
    }
    this.maxWorkMs = Math.max(this.maxWorkMs, performance.now() - start);
  }
  private finishFade(e: Entry): void {
    if (e.previousPool) {
      this.removePoolEntry(e.previousPool, String(e.data.id));
      e.previousPool = undefined;
    }
    if (e.previousFar) {
      this.removeFar(e);
      e.previousFar = false;
    }
    e.fadeAge = L.transitionSeconds;
  }
  private removePoolEntry(pool: InstancePool, id: string): void {
    pool.remove(id);
    if (!pool.count) {
      for (const [key, p] of this.pools)
        if (p === pool) {
          this.pools.delete(key);
          break;
        }
      pool.dispose();
    }
  }
  private addDetail(e: Entry, lod: 0 | 1 = 0): void {
    if (!this.options.assets || e.data.state === 'construction')
      this.removeFar(e);
    const b = e.data;
    const asset = this.options.assets?.request(
      b,
      () => {
        if (this.disposed || this.entries.get(b.id) !== e) return;
        if (this.options.assets) e.refresh = true;
        else {
          this.dropDetail(e);
          this.draw(e);
        }
        this.lodAge = R.lodInterval;
      },
      lod,
    );
    const geometry =
      asset?.geometry ??
      (e.model
        ? catalogGeometry(e.model, lod)
        : generateBuilding(
            b.defId as ZoneType,
            b.level,
            b.lotW,
            b.lotD,
            this.options.assets ? visualSeed(b) : b.seed,
          ));
    e.asset = Boolean(asset);
    if (asset && !this.catalogMaterials.has(asset.material)) {
      const material = asset.material;
      material.userData.infoRole = 'instance';
      material.emissiveIntensity = DAY_NIGHT.windowIntensity;
      const install = (previous?: ShaderHook) => {
        installBuildingShader(material, previous);
        installNightWindows(material, this.hour, material.onBeforeCompile);
      };
      install();
      this.options.registerMaterial?.(material, install);
      this.catalogMaterials.add(material);
    }
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
              this.options.registerMaterial?.(
                material,
                material === e.construction!.completed.material
                  ? (previous) =>
                      installNightWindows(material, this.hour, previous)
                  : undefined,
              );
            }
        }
      });
      this.group.add(e.construction.group);
      e.construction.setNight(true);
      e.construction.setEffects(this.effectsEnabled);
      if (!this.options.registerMaterial)
        installNightWindows(e.construction.completed.material, this.hour);
      return;
    }
    let hash = `${asset ? geometry.userData.assetId : 'procedural'}:${geometryHash(geometry)}`;
    // Exact comparison prevents even a hash collision from sharing the wrong facade.
    while (
      this.pools.has(hash) &&
      !sameGeometry(this.pools.get(hash)!.mesh.geometry, geometry)
    )
      hash += ':';
    let pool = this.pools.get(hash);
    if (!pool) {
      pool = new InstancePool(
        this.group,
        geometry,
        asset?.material ?? this.fullMaterial,
      );
      this.pools.set(hash, pool);
    }
    geometry.dispose();
    e.pool = pool;
  }
  private dropDetail(e: Entry): void {
    this.finishFade(e);
    if (e.pool) {
      this.removePoolEntry(e.pool, String(e.data.id));
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
  setInfoColors(colors: ReadonlyMap<number, string> | null): void {
    this.infoColors = colors;
    for (const [id, b] of this.authoritative) this.pending.set(id, b);
  }
  private draw(e: Entry): void {
    const b = e.data;
    if (e.construction && b.state !== 'construction') {
      this.dropDetail(e);
    }
    // An existing full-detail active model must also support returning to construction.
    if (e.pool && b.state === 'construction') this.dropDetail(e);
    const t = Math.min(1, e.age / R.placementSeconds);
    const bounce =
      !this.effectsEnabled || e.removed
        ? 1
        : Math.max(0.001, 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2);
    const sink =
      this.effectsEnabled && e.removed
        ? (e.shape.height * e.removal) / R.demolitionSeconds
        : 0;
    this.matrix
      .makeRotationY(b.rotation + Math.PI)
      .scale(this.scale.set(bounce, bounce, bounce));
    this.matrix.setPosition(b.pos.x, e.base - sink, b.pos.z);
    const condition =
      b.state === 'burned' || b.fire?.burning
        ? 2
        : b.state === 'abandoned'
          ? 1
          : 0;
    if (e.construction) {
      e.construction.group.matrixAutoUpdate = false;
      e.construction.group.matrix.copy(this.matrix);
      e.construction.group.matrixWorldNeedsUpdate = true;
      e.construction.setProgress(e.progress, e.base - sink);
    }
    const fade = Math.min(1, e.fadeAge / L.transitionSeconds);
    if (e.previousPool)
      e.previousPool.set(
        String(b.id),
        this.matrix,
        this.infoColors
          ? this.color.set(this.infoColors.get(b.id) ?? P.concrete)
          : this.color.setRGB(1, 1, 1),
        condition,
        fade - 1,
      );
    if (e.pool)
      e.pool.set(
        String(b.id),
        this.matrix,
        this.infoColors
          ? this.color.set(this.infoColors.get(b.id) ?? P.concrete)
          : this.color.setRGB(1, 1, 1),
        condition,
        fade,
      );
    if (!e.construction && (!e.pool || e.previousFar)) {
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
            this.color.set(this.infoColors?.get(b.id) ?? e.shape.wall),
            condition,
            e.previousFar ? fade - 1 : fade,
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
    this.lodQueue.delete(e);
    this.dropDetail(e);
    this.removeFar(e);
  }
  private emitDust(e: Entry): void {
    if (!this.effectsEnabled) return;
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
    this.hour.value = night ? 20 : 12;
  }
  setHour(hour: number): void {
    this.hour.value = hour;
  }
  readStats() {
    let detail = 0,
      construction = 0,
      abandoned = 0,
      removing = 0,
      assets = 0,
      transitioning = 0;
    const lods = [0, 0, 0];
    let triangles = this.far.count * 12;
    for (const pool of this.pools.values())
      triangles +=
        (pool.count *
          (pool.mesh.geometry.index?.count ??
            pool.mesh.geometry.getAttribute('position').count)) /
        3;
    for (const e of this.entries.values()) {
      lods[e.lod]!++;
      if (e.fadeAge < L.transitionSeconds) transitioning++;
      if (e.detail) detail++;
      if (e.detail && e.asset) assets++;
      if (e.data.state === 'construction') construction++;
      if (e.data.state === 'abandoned') abandoned++;
      if (e.removed) removing++;
    }
    return {
      buildings: this.entries.size,
      lods,
      triangles,
      lodPending: this.lodQueue.size,
      transitioning,
      effects: this.effectsEnabled,
      pending: this.pending.size,
      detail,
      assets,
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
  /** Roof anchor shares the actual generated massing, without per-frame geometry allocation. */
  roof(id: number, out: Vector3): boolean {
    const e = this.entries.get(id);
    if (!e || e.removed) return false;
    const b = e.data,
      depth = (b.lotD * CELL_SIZE) / 2;
    out.set(
      b.pos.x + Math.sin(b.rotation) * depth,
      e.base + e.shape.height,
      b.pos.z + Math.cos(b.rotation) * depth,
    );
    return true;
  }
  smokeAnchor(id: number, out: Vector3): boolean {
    const e = this.entries.get(id);
    if (!e || e.removed) return false;
    const b = e.data;
    if (b.defId !== 'I' || b.level < 2) return this.roof(id, out);
    const x =
        (b.lotW * CELL_SIZE - FX.industrialInsetM) * FX.industrialStackFraction,
      z = -b.lotD * CELL_SIZE + FX.industrialBackInsetM,
      angle = b.rotation + Math.PI;
    out.set(
      b.pos.x + x * Math.cos(angle) + z * Math.sin(angle),
      e.base + (e.pool?.mesh.geometry.boundingBox?.max.y ?? e.shape.height),
      b.pos.z - x * Math.sin(angle) + z * Math.cos(angle),
    );
    return true;
  }
  inspect(id: number) {
    const e = this.entries.get(id);
    return e
      ? {
          state: e.data.state,
          progress: e.progress,
          target: e.target,
          detail: e.detail,
          lod: e.lod,
          base: e.base,
          removed: e.removed,
          visual: e.construction?.readState() ?? constructionVisual(e.progress),
        }
      : null;
  }
  private clear(): void {
    this.focusedId = undefined;
    this.lodQueue.clear();
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
    for (const material of this.catalogMaterials)
      this.options.unregisterMaterial?.(material);
    this.catalogMaterials.clear();
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
