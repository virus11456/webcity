import { IntersectionProps } from './signals';
import { bridgeMesh } from './structures';
import { roadTrees } from './trees';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { CELL_SIZE, MAP_SIZE } from '../../data/config';
import { TERRAIN } from '../../data/terrain';
import { ROAD_MESH as C } from '../../data/roadMesh';
import type { RoadConstructionWorld } from '../../world/roadConstruction';
import {
  junctionMesh,
  roadArms,
  segmentMesh,
  type RoadMeshData,
} from './geometry';
const chunkM = TERRAIN.chunkCells * CELL_SIZE,
  chunks = Math.ceil(MAP_SIZE / chunkM);
interface Cached {
  key: string;
  data: RoadMeshData;
}
/** Cached geometry fragments, terrain-chunk ownership, and bounded GPU batches with staged rebuilds. */
export class RoadRenderer {
  readonly group = new Group();
  readonly material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    side: DoubleSide,
  });
  private signals: IntersectionProps | undefined;
  private seconds = 0;
  setTime(seconds: number): void {
    this.seconds = seconds;
    this.signals?.update(seconds);
  }
  private trees: ReturnType<typeof roadTrees> = null;
  private cache = new Map<string, Cached>();
  private job: Generator<void> | undefined;
  private batches = new Map<number, { key: string; mesh: Mesh }>();
  private generation = 0;
  private pending = new Set<BufferGeometry>();
  private cancel(): void {
    this.job?.return(undefined);
    for (const geometry of this.pending) geometry.dispose();
    this.pending.clear();
  }
  /** Schedule geometry work; unchanged fragments and GPU batches keep their buffers. */
  sync(world: RoadConstructionWorld): void {
    this.cancel();
    this.generation++;
    this.job = this.rebuild(world);
  }
  /** Spend at most one small work slice per frame; swap complete batches atomically. */
  update(): void {
    if (!this.job) return;
    const start = performance.now();
    do {
      if (this.job.next().done) {
        this.job = undefined;
        break;
      }
    } while (performance.now() - start < C.rebuildBudgetMs);
  }
  /** Diagnostic counts expose actual batches rather than guessing from segment count. */
  readStats(): {
    batches: number;
    pending: boolean;
    generation: number;
    trees: number;
    signals: number;
  } {
    return {
      batches: this.batches.size,
      trees: this.trees?.count ?? 0,
      signals: this.signals?.count ?? 0,
      pending: Boolean(this.job),
      generation: this.generation,
    };
  }
  private *rebuild(world: RoadConstructionWorld): Generator<void> {
    const arms = roadArms(world.nodes, world.segments),
      nodes = new Map(world.nodes.map((n) => [n.id, n]));
    const structureKey = JSON.stringify(world.segments);
    const groups = new Map<number, { parts: RoadMeshData[]; keys: string[] }>(),
      alive = new Set<string>();
    const add = (
      id: string,
      key: string,
      x: number,
      z: number,
      create: () => RoadMeshData,
    ) => {
      alive.add(id);
      let cached = this.cache.get(id);
      if (cached?.key !== key) {
        cached = { key, data: create() };
        this.cache.set(id, cached);
      }
      const cx = Math.max(
          0,
          Math.min(chunks - 1, Math.floor((x + MAP_SIZE / 2) / chunkM)),
        ),
        cz = Math.max(
          0,
          Math.min(chunks - 1, Math.floor((z + MAP_SIZE / 2) / chunkM)),
        );
      // Adjacent terrain chunks share one batch page; at most 24 road draws even over the entire map.
      const page = Math.floor(
        (cz * chunks + cx) / Math.ceil((chunks * chunks) / C.maxBatches),
      );
      const group = groups.get(page) ?? { parts: [], keys: [] };
      group.parts.push(cached!.data);
      group.keys.push(key);
      groups.set(page, group);
    };
    for (const segment of world.segments) {
      const a = arms
          .get(segment.start)!
          .find((a) => a.segment.id === segment.id)!,
        b = arms.get(segment.end)!.find((a) => a.segment.id === segment.id)!;
      const start = nodes.get(segment.start)!,
        end = nodes.get(segment.end)!;
      const key = JSON.stringify([
        segment,
        segment.elevated ? structureKey : undefined,
        start.pos,
        start.height,
        end.pos,
        end.height,
        a.trim,
        b.trim,
        arms.get(start.id)!.length,
        arms.get(end.id)!.length,
      ]);
      add(
        `s${segment.id}`,
        key,
        (start.pos.x + end.pos.x) / 2,
        (start.pos.z + end.pos.z) / 2,
        () => {
          const data = segmentMesh(
            a,
            b,
            arms.get(start.id)!.length >= 3,
            arms.get(end.id)!.length >= 3,
          );
          const structure = bridgeMesh(a, b, world);
          data.positions = data.positions.concat(structure.positions);
          data.colors = data.colors.concat(structure.colors);
          return data;
        },
      );
      yield;
    }
    for (const node of world.nodes) {
      const list = arms.get(node.id);
      if (!list) continue;
      const key = JSON.stringify([
        node,
        list.map((a) => [
          a.segment,
          a.trim,
          a.samples[1],
          a.samples[a.samples.length - 1],
        ]),
      ]);
      add(`n${node.id}`, key, node.pos.x, node.pos.z, () =>
        junctionMesh(node, list),
      );
      yield;
    }
    const replacement = new Map<number, { key: string; mesh: Mesh }>();
    for (const [id, group] of groups) {
      const key = group.keys.join('|'),
        old = this.batches.get(id);
      if (old?.key === key) {
        replacement.set(id, old);
        continue;
      }
      const length = group.parts.reduce(
          (sum, p) => sum + p.positions.length,
          0,
        ),
        positions = new Float32Array(length),
        colors = new Float32Array(length);
      let offset = 0;
      for (const part of group.parts) {
        positions.set(part.positions, offset);
        colors.set(part.colors, offset);
        offset += part.positions.length;
        yield;
      }
      const geometry = new BufferGeometry();
      this.pending.add(geometry);
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = world.segments.some((s) => s.elevated);
      replacement.set(id, { key, mesh });
      yield;
    }
    for (const [id, old] of this.batches)
      if (replacement.get(id) !== old) {
        this.group.remove(old.mesh);
        old.mesh.geometry.dispose();
      }
    for (const [id, batch] of replacement)
      if (this.batches.get(id) !== batch) this.group.add(batch.mesh);
    if (this.trees) {
      this.group.remove(this.trees);
      this.trees.geometry.dispose();
      const m = this.trees.material;
      if (Array.isArray(m)) m.forEach((v) => v.dispose());
      else m.dispose();
    }
    if (this.signals) {
      this.group.remove(this.signals.group);
      this.signals.dispose();
    }
    this.signals = new IntersectionProps(world, arms);
    this.signals.update(this.seconds);
    if (this.signals.count) this.group.add(this.signals.group);
    this.trees = roadTrees(arms);
    if (this.trees) this.group.add(this.trees);
    this.batches = replacement;
    this.pending.clear();
    for (const id of this.cache.keys())
      if (!alive.has(id)) this.cache.delete(id);
  }
  /** Release every GPU batch and cancel pending geometry work. */
  dispose(): void {
    this.cancel();
    this.job = undefined;
    for (const b of this.batches.values()) b.mesh.geometry.dispose();
    this.batches.clear();
    this.cache.clear();
    if (this.trees) {
      this.trees.geometry.dispose();
      const m = this.trees.material;
      if (Array.isArray(m)) m.forEach((v) => v.dispose());
      else m.dispose();
      this.trees = null;
    }
    this.signals?.dispose();
    this.material.dispose();
    this.group.clear();
  }
}
