import { expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type WebGLRenderer,
} from 'three';
const backend = vi.hoisted(() => ({ load: vi.fn(), dispose: vi.fn() }));
vi.mock('../../src/render/assets', () => ({
  AssetLibrary: class {
    load = backend.load;
    dispose = backend.dispose;
  },
}));
import { FacilityAssets } from '../../src/render/facilities/assets';
it('deduplicates pending loads and gives renderers independently disposable geometry with isolated state materials', async () => {
  const source = new Group(),
    material = new MeshStandardMaterial({ vertexColors: true });
  for (const lod of [0, 1, 2]) {
    const mesh = new Mesh(new BoxGeometry(), material);
    mesh.name = `LOD${lod}`;
    source.add(mesh);
  }
  backend.load.mockResolvedValue(source);
  const register = vi.fn(),
    unregister = vi.fn(),
    assets = new FacilityAssets({} as WebGLRenderer, register, unregister),
    ready = vi.fn();
  const b = { defId: 'clinic', lotW: 4, lotD: 4, state: 'active' as const };
  expect(assets.request(b, ready)).toBeUndefined();
  expect(assets.request(b, ready)).toBeUndefined();
  expect(backend.load).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
  const a = assets.request(b, ready)!,
    c = assets.request(b, ready)!;
  const mesh = a.getObjectByName('LOD0') as Mesh,
    copy = c.getObjectByName('LOD0') as Mesh;
  expect(a.getObjectByName('LOD1')).toBeUndefined();
  expect(mesh.geometry).not.toBe(copy.geometry);
  expect(mesh.material).toBe(copy.material);
  mesh.geometry.dispose();
  expect(copy.geometry.getAttribute('position').count).toBeGreaterThan(0);
  const disabled = assets.request({ ...b, enabled: false }, ready)!,
    burned = assets.request({ ...b, state: 'burned' }, ready)!;
  const dm = (disabled.getObjectByName('LOD0') as Mesh)
    .material as MeshStandardMaterial;
  const bm = (burned.getObjectByName('LOD0') as Mesh)
    .material as MeshStandardMaterial;
  expect(dm).not.toBe(mesh.material);
  expect(bm).not.toBe(dm);
  expect(bm.emissiveIntensity).toBe(0);
  for (const root of [a, c, disabled, burned])
    root.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  assets.dispose();
  expect(unregister).toHaveBeenCalledTimes(3);
  expect(backend.dispose).toHaveBeenCalledTimes(1);
  expect(assets.request(b, ready)).toBeUndefined();
});
