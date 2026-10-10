import { expect, it } from 'vitest';
import {
  CanvasTexture,
  Group,
  MeshStandardMaterial,
  PerspectiveCamera,
  Color,
  Matrix4,
  BoxGeometry,
} from 'three';
import { buildingLod, distantMassing } from '../../src/world/buildingLod';
import { BuildingRenderer } from '../../src/render/buildings/buildingRenderer';
import { InstancePool } from '../../src/render/buildings/instancePool';
import { catalogGeometry } from '../../src/render/buildings/catalogGeometry';
import { catalogModel } from '../../src/world/modelCatalog';
import { districtFixture } from '../../src/render/buildings/districtFixture';
it('uses 250/900 m with a 20 m stable band and preserves upper storey height in distant boxes', () => {
  expect(buildingLod(249, 2)).toBe(0);
  expect(buildingLod(251, 2)).toBe(1);
  expect(buildingLod(265, 0)).toBe(0);
  expect(buildingLod(275, 0)).toBe(1);
  expect(buildingLod(235, 1)).toBe(1);
  expect(buildingLod(225, 1)).toBe(0);
  expect(buildingLod(910, 1)).toBe(1);
  expect(buildingLod(921, 1)).toBe(2);
  expect(buildingLod(890, 2)).toBe(2);
  expect(buildingLod(879, 2)).toBe(1);
  const volumes = [
    { x: 0, y: 0, z: 0, w: 20, h: 5, d: 20, floors: 1 },
    { x: 0, y: 5, z: 0, w: 12, h: 30, d: 12, floors: 10 },
    { x: 0, y: 35, z: 0, w: 8, h: 20, d: 8, floors: 6 },
  ];
  expect(distantMassing(volumes, true)).toHaveLength(2);
  expect(distantMassing(volumes, true)[1]!.h).toBe(50);
  expect(distantMassing(volumes, false)).toHaveLength(1);
  expect(distantMassing(volumes, false)[0]!.h).toBe(55);
});
it('keeps fade values across pool growth and swap deletion', () => {
  const root = new Group(),
    geometry = new BoxGeometry(),
    material = new MeshStandardMaterial(),
    p = new InstancePool(root, geometry, material, 1),
    matrix = new Matrix4(),
    color = new Color();
  p.set('a', matrix, color, 0, 0.4);
  p.set('b', matrix, color, 0, -0.6);
  p.remove('a');
  expect(p.mesh.geometry.getAttribute('buildingFade').getX(0)).toBeCloseTo(
    -0.6,
  );
  p.dispose();
  geometry.dispose();
  material.dispose();
});
it('renders more than sixteen full models, fades safely, reduces city triangles by over 60%, and releases retired pools', () => {
  const canvas = { width: 1, height: 1 } as HTMLCanvasElement,
    map = new CanvasTexture(canvas),
    emission = new CanvasTexture(canvas),
    material = new MeshStandardMaterial();
  const renderer = new BuildingRenderer(new Group(), {
    heightAt: () => 0,
    atlas: {
      map,
      emissiveMap: emission,
      color: canvas,
      emission: canvas,
      dispose() {},
    },
    assets: {
      request(b, _ready, lod = 0) {
        const model = catalogModel(b)!;
        const geometry = catalogGeometry(model, lod);
        geometry.userData.assetId = model.id;
        return { geometry, material };
      },
    },
  });
  const base = districtFixture(1)[0]!,
    buildings = Array.from({ length: 100 }, (_, i) => ({
      ...structuredClone(base),
      id: i + 1,
      defId: 'RH',
      level: 3,
      lotW: 2,
      lotD: 2,
      seed: i % 2,
      pos: { x: (i % 10) * 20 - 90, z: Math.floor(i / 10) * 20 - 90 },
      state: 'active' as const,
    }));
  renderer.reset(buildings);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 120, 0);
  const settle = () => {
    for (let i = 0; i < 180; i++) renderer.update(1 / 30, camera);
  };
  settle();
  const close = renderer.readStats();
  expect(close.assets).toBe(100);
  expect(close.lods).toEqual([100, 0, 0]);
  expect(close.pools).toBe(2);
  camera.position.set(0, 500, 0);
  settle();
  expect(renderer.readStats().lods).toEqual([0, 100, 0]);
  expect(renderer.readStats().pools).toBe(2);
  camera.position.set(0, 1600, 0);
  settle();
  const far = renderer.readStats();
  expect(far.triangles).toBeLessThan(close.triangles * 0.4);
  expect(far.pools).toBe(0);
  expect(far.lods).toEqual([0, 0, 100]);
  for (let i = 0; i < 3; i++) {
    camera.position.set(0, 120, 0);
    settle();
    expect(renderer.readStats().pools).toBe(2);
    camera.position.set(0, 1600, 0);
    settle();
    expect(renderer.readStats().pools).toBe(0);
  }
  // Removal during a new transition must not leave either model behind.
  camera.position.set(0, 120, 0);
  for (let i = 0; i < 9; i++) renderer.update(1 / 30, camera);
  renderer.accept({
    t: 'buildingsChanged',
    added: [],
    updated: [],
    removed: buildings.map((b) => b.id),
  });
  settle();
  expect(renderer.readStats()).toMatchObject({
    buildings: 0,
    pools: 0,
    farInstances: 0,
  });
  renderer.dispose();
  map.dispose();
  emission.dispose();
  material.dispose();
});
