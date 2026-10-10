import {
  Mesh,
  Texture,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import basisJs from 'three/examples/jsm/libs/basis/basis_transcoder.js?url';
import basisWasm from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';
import { LoadingManager } from 'three';
import {
  parseAssetManifest,
  type AssetEntry,
  type AssetManifest,
} from '../core/assetManifest';

/** Release owned GLTF GPU resources once, even when several meshes share them. */
export function disposeAsset(root: Object3D): void {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const mat of Array.isArray(node.material)
      ? node.material
      : [node.material]) {
      // Materials and textures are shared within the GLTF scene.
      for (const value of Object.values(mat))
        if (value instanceof Texture) textures.add(value);
      materials.add(mat);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

/** Scene-scoped library. Clones share GPU resources; remove them before dispose(). */
export class AssetLibrary {
  private readonly ktx: KTX2Loader;
  private readonly loader: GLTFLoader;
  private manifest: Promise<AssetManifest> | undefined;
  private readonly cache = new Map<string, Promise<GLTF>>();
  private disposed = false;
  private readonly abort = new AbortController();
  constructor(
    renderer: WebGLRenderer,
    private readonly base = `${import.meta.env.BASE_URL}assets/`,
  ) {
    const manager = new LoadingManager();
    manager.setURLModifier((url) =>
      url.endsWith('/basis_transcoder.js')
        ? basisJs
        : url.endsWith('/basis_transcoder.wasm')
          ? basisWasm
          : url,
    );
    this.ktx = new KTX2Loader(manager)
      .setTranscoderPath(`${base}decoders/`)
      .setWorkerLimit(1)
      .detectSupport(renderer);
    this.loader = new GLTFLoader(manager)
      .setMeshoptDecoder(MeshoptDecoder)
      .setKTX2Loader(this.ktx);
  }
  /** Retrieve metadata once; failed requests can be retried. */
  async list(): Promise<readonly AssetEntry[]> {
    if (this.disposed) throw new Error('Asset library disposed');
    this.manifest ??= fetch(`${this.base}manifest.json`, {
      signal: this.abort.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Asset manifest HTTP ${response.status}`);
        return parseAssetManifest(await response.json());
      })
      .catch((error: unknown) => {
        this.manifest = undefined;
        throw error;
      });
    return (await this.manifest).models;
  }
  /** Clone a static model; concurrent requests share download and decoding. */
  async load(id: string): Promise<Object3D> {
    const entry = (await this.list()).find((entry) => entry.id === id);
    if (this.disposed) throw new Error('Asset library disposed');
    if (!entry) throw new Error(`Unknown model: ${id}`);
    let pending = this.cache.get(id);
    if (!pending) {
      pending = this.loader
        .loadAsync(`${this.base}${entry.url}`)
        .then((gltf) => {
          if (this.disposed) {
            disposeAsset(gltf.scene);
            throw new Error('Asset library disposed');
          }
          return gltf;
        })
        .catch((error: unknown) => {
          this.cache.delete(id);
          throw error;
        });
      this.cache.set(id, pending);
    }
    const gltf = await pending;
    if (this.disposed) throw new Error('Asset library disposed');
    return gltf.scene.clone(true);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    const pending = [...this.cache.values()];
    this.cache.clear();
    // Let in-flight transcodes finish before destroying their worker pool.
    void Promise.allSettled(
      pending.map(async (asset) => disposeAsset((await asset).scene)),
    ).then(() => this.ktx.dispose());
  }
}
