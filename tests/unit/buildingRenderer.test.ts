import { WorldMirror } from '../../src/bridge/mirror';
import { Simulation } from '../../src/sim/simulation';
import { describe, expect, it, vi } from 'vitest';
import {
  Vector3,
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
} from 'three';
import {
  InstancePool,
  geometryHash,
} from '../../src/render/buildings/instancePool';
import { BuildingRenderer } from '../../src/render/buildings/buildingRenderer';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { generateBuilding } from '../../src/render/buildings/generator';
import { buildingCatalog } from '../../src/world/buildingCatalog';
import type { WindowAtlas } from '../../src/render/buildings/windowAtlas';
const atlas = (): WindowAtlas => {
  const canvas = { width: 1, height: 1 } as HTMLCanvasElement;
  const map = new CanvasTexture(canvas),
    emissiveMap = new CanvasTexture(canvas);
  return {
    map,
    emissiveMap,
    color: canvas,
    emission: canvas,
    dispose() {
      map.dispose();
      emissiveMap.dispose();
    },
  };
};
function setup() {
  const a = atlas(),
    group = new Group();
  const renderer = new BuildingRenderer(group, {
    heightAt: (x, z) => x / 100 + z / 1000,
    atlas: a,
  });
  const camera = new PerspectiveCamera();
  camera.position.set(0, 90, 160);
  const settle = (n = 80) => {
    for (let i = 0; i < n; i++) renderer.update(1 / 60, camera);
  };
  const dispose = () => {
    renderer.dispose();
    a.dispose();
  };
  return { renderer, group, camera, settle, dispose };
}
describe('building instance pool', () => {
  it('grows without losing matrices/colors/states, swap-removes the correct id, then disposes', () => {
    const root = new Group(),
      g = new BoxGeometry(),
      m = new MeshBasicMaterial(),
      pool = new InstancePool(root, g, m, 2);
    const matrix = new Matrix4(),
      color = new Color();
    for (let i = 0; i < 9; i++)
      pool.set(
        String(i),
        matrix.makeTranslation(i, 2, 3),
        color.setRGB(i / 10, 0, 0),
        i % 3,
      );
    expect(pool.mesh.instanceMatrix.count).toBe(16);
    expect(pool.count).toBe(9);
    pool.remove('2');
    pool.remove('2');
    expect(pool.count).toBe(8);
    pool.mesh.getMatrixAt(2, matrix);
    expect(matrix.elements[12]).toBe(8);
    pool.mesh.getColorAt(2, color);
    expect(color.r).toBeCloseTo(0.8);
    expect(pool.mesh.geometry.getAttribute('buildingState').getX(2)).toBe(2);
    pool.set('8', matrix.makeTranslation(80, 0, 0), color, 1);
    pool.mesh.getMatrixAt(2, matrix);
    expect(matrix.elements[12]).toBe(80);
    const geometryDispose = vi.fn();
    pool.mesh.geometry.addEventListener('dispose', geometryDispose);
    pool.dispose();
    expect(root.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    g.dispose();
    m.dispose();
  });
  it('hashes deterministic geometry content including the facade color', () => {
    const a = generateBuilding('RL', 2, 2, 2, 3),
      b = generateBuilding('RL', 2, 2, 2, 3);
    expect(geometryHash(a)).toBe(geometryHash(b));
    b.getAttribute('color').setX(0, 0.123);
    expect(geometryHash(a)).not.toBe(geometryHash(b));
    a.dispose();
    b.dispose();
  });
});
describe('building event rendering', () => {
  it('keeps seeded distant massing equal to detailed generation for every legal combination', () => {
    for (const s of buildingCatalog(371)) {
      const near = generateBuilding(s.zone, s.level, s.w, s.d, s.seed),
        far = generateBuilding(s.zone, s.level, s.w, s.d, s.seed, false);
      expect(far.userData.massing).toEqual(near.userData.massing);
      expect(far.userData.wall).toBe(near.userData.wall);
      expect(far.getAttribute('position').count).toBe(0);
      near.dispose();
      far.dispose();
    }
  });
  it('rebuilds the model and emits a bounded change effect when an occupied home upgrades', () => {
    const s = setup(),
      b = structuredClone(districtFixture(2)[1]!);
    b.level = 1;
    b.state = 'active';
    s.renderer.reset([b]);
    s.settle(180);
    const before = new Vector3(),
      after = new Vector3();
    s.renderer.roof(b.id, before);
    expect(s.renderer.readStats().dust).toBe(0);
    s.renderer.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: [{ id: b.id, level: 5 }],
    });
    s.settle(1);
    s.renderer.roof(b.id, after);
    expect(after.y).toBeGreaterThan(before.y);
    expect(s.renderer.readStats().dust).toBeGreaterThan(0);
    s.settle(180);
    expect(s.renderer.readStats().dust).toBe(0);
    s.dispose();
  });
  it('coalesces pending adds, partial patches and removal, never mutating event data', () => {
    const s = setup(),
      data = districtFixture(4),
      copy = structuredClone(data);
    s.renderer.accept({
      t: 'buildingsChanged',
      added: data,
      updated: [],
      removed: [],
    });
    s.renderer.accept({
      t: 'buildingsChanged',
      added: [],
      updated: [
        { id: 1, state: 'abandoned' },
        { id: 2, level: 4 },
        { id: 99, state: 'active' },
      ],
      removed: [4],
    });
    s.settle();
    expect(s.renderer.readStats().buildings).toBe(3);
    expect(s.renderer.inspect(1)?.state).toBe('abandoned');
    expect(s.renderer.inspect(4)).toBeNull();
    expect(data).toEqual(copy);
    s.dispose();
  });
  it('interpolates only authoritative progress and removes scaffolds at authoritative completion', () => {
    const s = setup(),
      b = districtFixture(4)[0]!;
    b.state = 'construction';
    b.stateTimer = 0;
    s.renderer.reset([b]);
    s.settle();
    expect(s.renderer.inspect(1)?.progress).toBe(0);
    s.renderer.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: [{ id: 1, stateTimer: 1.5 }],
    });
    s.renderer.update(0.05, s.camera);
    expect(s.renderer.inspect(1)!.progress).toBeGreaterThan(0);
    expect(s.renderer.inspect(1)!.progress).toBeLessThan(0.5);
    s.settle();
    expect(s.renderer.inspect(1)?.progress).toBe(0.5);
    expect(s.renderer.inspect(1)?.visual.scaffolding).toBe(true);
    s.settle(600);
    expect(s.renderer.inspect(1)?.progress).toBe(0.5);
    s.renderer.accept({
      t: 'buildingsChanged',
      added: [],
      removed: [],
      updated: [{ id: 1, state: 'active', stateTimer: 0 }],
    });
    s.settle();
    expect(s.renderer.inspect(1)?.progress).toBe(1);
    expect(s.renderer.inspect(1)?.visual.scaffolding).toBe(false);
    s.dispose();
  });
  it('shares identical geometry pools, removes with animation and supports a reused id', () => {
    const s = setup(),
      b = districtFixture(4)[0]!,
      other = { ...b, id: 2, pos: { x: 20, z: -12 } };
    s.renderer.reset([b, other]);
    s.settle();
    expect(s.renderer.readStats().pools).toBe(1);
    s.renderer.accept({
      t: 'buildingsChanged',
      added: [],
      updated: [],
      removed: [1],
    });
    s.renderer.update(0.05, s.camera);
    expect(s.renderer.inspect(1)?.removed).toBe(true);
    expect(s.renderer.readStats().removing).toBe(1);
    s.settle();
    expect(s.renderer.inspect(1)).toBeNull();
    expect(s.renderer.readStats().pools).toBe(1);
    s.renderer.accept({
      t: 'buildingsChanged',
      added: [b],
      updated: [],
      removed: [2],
    });
    s.settle();
    expect(s.renderer.inspect(1)).not.toBeNull();
    expect(s.renderer.inspect(2)).toBeNull();
    s.renderer.reset([]);
    expect(s.renderer.readStats().pools).toBe(0);
    expect(s.renderer.readStats().buildings).toBe(0);
    s.dispose();
    expect(s.group.children).toHaveLength(0);
  });
  it('processes 5,000 diverse buildings across frames with bounded detailed pools and resource release', () => {
    const s = setup();
    s.camera.position.set(3000, 3000, 3000);
    s.renderer.reset(districtFixture(5000));
    s.renderer.update(1 / 60, s.camera);
    expect(s.renderer.readStats().pending).toBeGreaterThan(0);
    expect(s.renderer.readStats().buildings).toBeLessThanOrEqual(24);
    s.settle(1500);
    expect(s.renderer.readStats().buildings).toBe(5000);
    expect(s.renderer.readStats().pending).toBe(0);
    expect(s.renderer.readStats().pools).toBe(0);
    expect(s.renderer.readStats().farInstances).toBeGreaterThan(5000);
    s.camera.position.set(0, 80, 100);
    s.settle(240);
    expect(s.renderer.readStats().pools).toBeLessThanOrEqual(16);
    s.renderer.reset([]);
    s.settle();
    expect(s.renderer.readStats().farInstances).toBe(0);
    expect(s.renderer.readStats().dust).toBe(0);
    s.dispose();
  });
});

it('returns a defensive building-only mirror and renderer resets on ready', () => {
  const mirror = new WorldMirror();
  expect(mirror.readBuildings()).toEqual([]);
  const snapshot = new Simulation({
    seed: 11456,
    mapId: 'valley',
    mode: 'normal',
    cityName: 'Test',
  }).snapshot();
  snapshot.buildings = districtFixture(4);
  mirror.apply({ t: 'ready', reqId: 1, snapshot });
  const copy = mirror.readBuildings();
  copy[0]!.pos.x = 9999;
  copy.pop();
  expect(mirror.readBuildings()).toEqual(snapshot.buildings);
  const s = setup();
  s.renderer.accept({ t: 'ready', reqId: 1, snapshot });
  s.settle();
  expect(s.renderer.readStats().buildings).toBe(4);
  snapshot.buildings = [];
  s.renderer.accept({ t: 'ready', reqId: 2, snapshot });
  s.settle();
  expect(s.renderer.readStats().buildings).toBe(0);
  s.dispose();
});

it('prioritizes the inspected construction inside the four-model detail budget', () => {
  const s = setup(),
    fixture = districtFixture(1);
  const buildings = Array.from({ length: 8 }, (_, i) => ({
    ...fixture[0]!,
    id: 100 + i,
    pos: { x: i * 8, z: 100 },
    rotation: 0,
    state: 'construction' as const,
    stateTimer: 1.5,
  }));
  buildings[7]!.pos = { x: 0, z: -100 };
  s.renderer.reset(buildings);
  s.settle(180);
  expect(s.renderer.inspect(107)!.detail).toBe(false);
  s.renderer.focus(107);
  s.settle(180);
  expect(s.renderer.inspect(107)!.detail).toBe(true);
  expect(s.renderer.readStats().detail).toBeLessThanOrEqual(4);
  s.dispose();
});
