import {
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type WebGLRenderer,
} from 'three';
import { AssetLibrary } from '../assets';
import { facilityModel } from '../../world/facilityModels';
import type { Building } from '../../world/types';
import { FIRE_PALETTE, SERVICE_PALETTE } from '../../data/palette';
import { DAY_NIGHT } from '../../data/dayNight';
import { installNightWindows } from '../nightWindows';
type ShaderHook = Material['onBeforeCompile'];
/** Scene-owned templates; returned geometry is owned by the existing utility/service renderer. */
export class FacilityAssets {
  private library: AssetLibrary;
  private cache = new Map<string, Group>();
  private pending = new Map<string, Set<() => void>>();
  private materials = new Map<string, MeshStandardMaterial>();
  private template?: MeshStandardMaterial;
  private disposed = false;
  readonly hour = { value: 12 };
  constructor(
    renderer: WebGLRenderer,
    private register: (
      m: Material,
      install?: (previous?: ShaderHook) => void,
    ) => void,
    private unregister: (m: Material) => void,
  ) {
    this.library = new AssetLibrary(renderer);
  }
  request(
    b: Pick<Building, 'defId' | 'lotW' | 'lotD' | 'enabled' | 'state' | 'fire'>,
    ready: () => void,
  ): Group | undefined {
    const spec = facilityModel(b.defId);
    if (!spec || this.disposed) return;
    const cached = this.cache.get(spec.id);
    if (!cached) {
      const listeners = this.pending.get(spec.id);
      if (listeners) {
        listeners.add(ready);
        return;
      }
      this.pending.set(spec.id, new Set([ready]));
      void this.library
        .load(spec.id)
        .then((root) => {
          if (this.disposed) return;
          let first: MeshStandardMaterial | undefined;
          root.traverse((o) => {
            if (o instanceof Mesh && o.material instanceof MeshStandardMaterial)
              first ??= o.material;
          });
          if (!first) throw new Error('Facility has no standard material');
          if (!this.template) this.template = first;
          else if (first !== this.template) {
            first.map?.dispose();
            first.emissiveMap?.dispose();
            first.map = this.template.map;
            first.emissiveMap = this.template.emissiveMap;
          }
          const group = new Group();
          group.add(root);
          this.cache.set(spec.id, group);
          const done = this.pending.get(spec.id);
          this.pending.delete(spec.id);
          done?.forEach((fn) => fn());
        })
        .catch(() => this.pending.delete(spec.id));
      return;
    }
    const state =
      b.fire?.burning || b.state === 'burned'
        ? 'burned'
        : b.enabled === false
          ? 'disabled'
          : 'normal';
    let material = this.materials.get(state);
    if (!material) {
      material = this.template!.clone();
      material.userData.infoRole = 'building';
      material.emissiveIntensity =
        state === 'normal' ? DAY_NIGHT.windowIntensity : 0;
      if (state !== 'normal') {
        material.vertexColors = false;
        material.color.set(
          state === 'burned' ? FIRE_PALETTE.char : SERVICE_PALETTE.power,
        );
      }
      const current = material;
      const install = (previous?: ShaderHook) =>
        installNightWindows(current, this.hour, previous);
      install();
      this.register(material, install);
      this.materials.set(state, material);
    }
    const clone = cached.clone(true);
    clone.traverse((o) => {
      if (/^(LOD|Rotor)[12]$/.test(o.name)) o.visible = false;
    });
    // Remove hidden LOD subtrees before cloning any GPU buffers.
    for (const root of clone.children)
      for (const child of [...root.children])
        if (!child.visible) root.remove(child);
    clone.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry = o.geometry.clone();
        o.material = material!;
        o.castShadow = o.receiveShadow = true;
      }
    });
    clone.rotation.y = Math.PI;
    clone.scale.set(b.lotW / spec.w, 1, b.lotD / spec.d);
    clone.userData.facilityAsset = spec.id;
    return clone;
  }
  readStats() {
    return { loaded: this.cache.size, pending: this.pending.size };
  }
  dispose() {
    this.disposed = true;
    this.pending.clear();
    this.cache.clear();
    for (const m of this.materials.values()) {
      this.unregister(m);
      m.dispose();
    }
    this.materials.clear();
    this.library.dispose();
  }
}
