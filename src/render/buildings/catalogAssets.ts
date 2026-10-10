import {
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type WebGLRenderer,
} from 'three';
import { AssetLibrary } from '../assets';
import { catalogModel } from '../../world/modelCatalog';
import type { Building } from '../../world/types';
interface Template {
  geometry: BufferGeometry[];
  material: MeshStandardMaterial;
}
export interface CatalogGeometry {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
}
/** Geometry and textures are shared by catalog ID; failures leave procedural rendering available. */
export class CatalogAssets {
  private readonly library: AssetLibrary;
  private readonly cache = new Map<string, Template>();
  private readonly pending = new Map<string, Set<() => void>>();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private disposed = false;
  constructor(renderer: WebGLRenderer) {
    this.library = new AssetLibrary(renderer);
  }
  request(
    b: Building,
    ready: () => void,
    lod: 0 | 1 | 2 = 0,
  ): CatalogGeometry | undefined {
    const model = catalogModel(b);
    if (!model || this.disposed) return;
    const cached = this.cache.get(model.id);
    if (cached)
      return {
        geometry: cached.geometry[lod]!.clone(),
        material: cached.material,
      };
    let callbacks = this.pending.get(model.id);
    if (callbacks) {
      callbacks.add(ready);
      return;
    }
    callbacks = new Set([ready]);
    this.pending.set(model.id, callbacks);
    void this.library
      .load(model.id)
      .then((root) => {
        if (this.disposed) return;
        root.updateMatrixWorld(true);
        const geometry: BufferGeometry[] = [];
        let material: MeshStandardMaterial | undefined;
        for (let i = 0; i < 3; i++) {
          const node = root.getObjectByName(`LOD${i}`);
          if (
            !(node instanceof Mesh) ||
            !(node.material instanceof MeshStandardMaterial)
          )
            throw new Error('Catalog model missing LOD/material');
          const g = node.geometry.clone();
          // Meshopt quantization may use normalized integer buffers and node transforms.
          for (const key of ['position', 'normal']) {
            const a = g.getAttribute(key),
              values = new Float32Array(a.count * 3);
            for (let v = 0; v < a.count; v++) {
              values[v * 3] = a.getX(v);
              values[v * 3 + 1] = a.getY(v);
              values[v * 3 + 2] = a.getZ(v);
            }
            g.setAttribute(key, new Float32BufferAttribute(values, 3));
          }
          g.applyMatrix4(node.matrixWorld);
          g.userData = { ...node.userData, assetId: model.id };
          g.computeBoundingBox();
          g.computeBoundingSphere();
          geometry.push(g);
          material ??= node.material;
        }
        let shared = this.materials.get(model.zone);
        if (!shared) {
          shared = material!;
          this.materials.set(model.zone, shared);
        } else if (material !== shared) {
          material!.map?.dispose();
          material!.emissiveMap?.dispose();
          material!.map = material!.emissiveMap = null;
        }
        this.cache.set(model.id, { geometry, material: shared });
        const listeners = this.pending.get(model.id);
        this.pending.delete(model.id);
        listeners?.forEach((fn) => fn());
      })
      .catch(() => {
        this.pending.delete(model.id);
      });
    return;
  }
  dispose(): void {
    this.disposed = true;
    this.pending.clear();
    for (const t of this.cache.values())
      for (const g of t.geometry) g.dispose();
    this.cache.clear();
    this.materials.clear();
    this.library.dispose();
  }
}
