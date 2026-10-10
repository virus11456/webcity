import {
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type PerspectiveCamera,
} from 'three';
import { QUALITY, type QualityLevel } from '../../data/config';
import { VEGETATION as V } from '../../data/vegetation';
import {
  generateVegetation,
  vegetationData,
  VegetationOccupancy,
  type VegetationWorld,
} from '../../world/vegetation';
import type { Terrain } from '../../world/terrain';
import { vegetationGeometry } from './models';
import { installBillboard, vegetationBillboard } from './billboard';

/** Double-buffered instancing. Generation, occupancy and LOD rebatching each yield within a frame budget. */
export class VegetationRenderer {
  readonly group = new Group();
  readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
  });
  readonly billboard = vegetationBillboard();
  private readonly data = vegetationData();
  private readonly mask = new VegetationOccupancy();
  private generation: Generator<void> | null;
  private initialization: Generator<void> | null = null;
  private occupancy: Generator<void> | null = null;
  private rebuild: Generator<void> | null = null;
  private readonly matrix = new Matrix4();
  private readonly lastCamera = new Vector3(Infinity, Infinity, Infinity);
  private readonly levels = new Int8Array(V.trees + V.shrubs).fill(-1);
  private readonly buffers: InstancedMesh[][] = [];
  private readonly counts = new Uint32Array(24);
  private front = 0;
  private dirty = true;
  private density = 1;
  private rendered = 0;
  private excluded = 0;
  private readonly lodCounts = new Uint32Array(3);
  constructor(terrain: Pick<Terrain, 'seed' | 'heightAt' | 'resources'>) {
    this.generation = generateVegetation(terrain, this.data);
    this.installBillboard();
  }
  installBillboard(previous?: Material['onBeforeCompile']): void {
    installBillboard(this.billboard.material, previous);
  }
  setQuality(level: QualityLevel): void {
    this.setDensity(QUALITY[level].treeDensity);
  }
  setDensity(value: number): void {
    const next = Math.max(0, Math.min(1, value));
    if (this.density !== next) {
      this.density = next;
      this.invalidate();
    }
  }
  sync(world: VegetationWorld): void {
    this.occupancy = this.mask.sync(world);
    this.invalidate();
  }
  private invalidate(): void {
    this.rebuild = null;
    this.dirty = true;
  }
  private *initialize(): Generator<void> {
    const capacity = new Uint32Array(8);
    for (let i = 0; i < this.data.count; i++)
      capacity[this.data.species[i]!]!++;
    for (let b = 0; b < 2; b++) {
      const meshes: InstancedMesh[] = [];
      for (let species = 0; species < 8; species++)
        for (let lod = 0; lod < 3; lod++) {
          const geometry = vegetationGeometry(species, lod);
          if (lod === 2) {
            const uv = geometry.getAttribute('uv');
            for (let i = 0; i < uv.count; i++)
              uv.setX(i, (uv.getX(i) + species) / 8);
          }
          const mesh = new InstancedMesh(
            geometry,
            lod === 2 ? this.billboard.material : this.material,
            Math.max(1, capacity[species]!),
          );
          mesh.count = 0;
          mesh.visible = false;
          mesh.frustumCulled = false;
          mesh.castShadow = lod === 0;
          mesh.receiveShadow = lod !== 2;
          meshes.push(mesh);
          this.group.add(mesh);
          yield;
        }
      this.buffers.push(meshes);
    }
  }
  private *batch(x: number, y: number, z: number): Generator<void> {
    const target = this.buffers[1 - this.front]!;
    this.counts.fill(0);
    let excluded = 0,
      rendered = 0;
    const lodCounts = [0, 0, 0];
    for (let i = 0; i < this.data.count; i++) {
      if (i % V.workSlice === 0) yield;
      const px = this.data.positions[i * 3]!,
        py = this.data.positions[i * 3 + 1]!,
        pz = this.data.positions[i * 3 + 2]!;
      if (this.mask.blocked(px, pz)) {
        excluded++;
        continue;
      }
      if ((i % 100) / 100 >= this.density) continue;
      const d = Math.hypot(x - px, y - py, z - pz),
        old = this.levels[i]!;
      let lod = d < V.lod0M ? 0 : d < V.lod1M ? 1 : 2;
      if (old === 0 && d < V.lod0M + V.lodHysteresisM) lod = 0;
      else if (
        old === 1 &&
        d > V.lod0M - V.lodHysteresisM &&
        d < V.lod1M + V.lodHysteresisM
      )
        lod = 1;
      else if (old === 2 && d > V.lod1M - V.lodHysteresisM) lod = 2;
      this.levels[i] = lod;
      const index = this.data.species[i]! * 3 + lod,
        slot = this.counts[index]!++;
      this.matrix.makeScale(
        this.data.scales[i]!,
        this.data.scales[i]!,
        this.data.scales[i]!,
      );
      this.matrix.setPosition(px, py, pz);
      target[index]!.setMatrixAt(slot, this.matrix);
      lodCounts[lod]!++;
      rendered++;
    }
    for (let i = 0; i < target.length; i++) {
      const mesh = target[i]!;
      mesh.count = this.counts[i]!;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = mesh.count > 0;
      this.buffers[this.front]![i]!.visible = false;
    }
    this.front = 1 - this.front;
    this.rendered = rendered;
    this.excluded = excluded;
    this.lodCounts.set(lodCounts);
    this.lastCamera.set(x, y, z);
  }
  update(camera: PerspectiveCamera): void {
    const start = performance.now();
    do {
      if (this.generation) {
        if (this.generation.next().done) {
          this.generation = null;
          this.initialization = this.initialize();
        } else continue;
      }
      if (this.initialization) {
        if (this.initialization.next().done) this.initialization = null;
        else continue;
      }
      if (this.occupancy) {
        if (this.occupancy.next().done) this.occupancy = null;
        else continue;
      }
      if (
        !this.rebuild &&
        (this.dirty ||
          camera.position.distanceToSquared(this.lastCamera) >
            V.cameraRefreshM ** 2)
      ) {
        this.dirty = false;
        this.rebuild = this.batch(
          camera.position.x,
          camera.position.y,
          camera.position.z,
        );
      }
      if (!this.rebuild) break;
      if (this.rebuild.next().done) {
        this.rebuild = null;
        break;
      }
    } while (performance.now() - start < V.budgetMs);
  }
  readStats(): {
    generated: number;
    rendered: number;
    excluded: number;
    lod0: number;
    lod1: number;
    lod2: number;
    pending: boolean;
  } {
    return {
      generated: this.data.count,
      rendered: this.rendered,
      excluded: this.excluded,
      lod0: this.lodCounts[0]!,
      lod1: this.lodCounts[1]!,
      lod2: this.lodCounts[2]!,
      pending: Boolean(
        this.generation ||
        this.initialization ||
        this.occupancy ||
        this.rebuild ||
        this.dirty,
      ),
    };
  }
  dispose(): void {
    this.generation =
      this.initialization =
      this.occupancy =
      this.rebuild =
        null;
    for (const meshes of this.buffers)
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
    this.material.dispose();
    this.billboard.material.dispose();
    this.billboard.texture.dispose();
    this.group.clear();
  }
}
