import { PerspectiveCamera, InstancedMesh } from 'three';
import { VegetationRenderer } from '../../src/render/vegetation/vegetation';
import { expect, it } from 'vitest';
import {
  generateVegetation,
  vegetationData,
  VegetationOccupancy,
  type VegetationWorld,
} from '../../src/world/vegetation';
import { VEGETATION as V } from '../../src/data/vegetation';
import { WORLD } from '../../src/data/config';
import { vegetationGeometry } from '../../src/render/vegetation/models';
const terrain = {
  seed: 31,
  heightAt: () => 60,
  resources: {
    forest: new Uint8Array(WORLD.fieldCells ** 2).fill(255),
    fertile: new Uint8Array(),
    ore: new Uint8Array(),
    oil: new Uint8Array(),
  },
};
it('generates bounded deterministic forest positions and six trees plus two shrubs, excluding water and bare resources', () => {
  const a = vegetationData(),
    b = vegetationData();
  let batches = 0;
  for (const _ of generateVegetation(terrain, a)) {
    void _;
    batches++;
  }
  for (const _ of generateVegetation(terrain, b)) void _;
  expect(a.count).toBe(V.trees + V.shrubs);
  expect(b.positions).toEqual(a.positions);
  expect(batches).toBeGreaterThan(100);
  expect(new Set(a.species).size).toBe(8);
  const empty = {
    ...terrain,
    resources: {
      ...terrain.resources,
      forest: new Uint8Array(WORLD.fieldCells ** 2),
    },
  };
  for (const _ of generateVegetation(empty, b)) void _;
  expect(b.count).toBe(0);
  for (const _ of generateVegetation({ ...terrain, heightAt: () => 0 }, b))
    void _;
  expect(b.count).toBe(0);
});
it('clears road widths and rotated building footprints, preserves raised roads and rebuilds after demolition', () => {
  const mask = new VegetationOccupancy(),
    world: VegetationWorld = {
      nodes: [
        {
          id: 1,
          pos: { x: -100, z: 0 },
          height: 60,
          segments: [3],
          control: 'none',
        },
        {
          id: 2,
          pos: { x: 100, z: 0 },
          height: 60,
          segments: [3],
          control: 'none',
        },
      ],
      segments: [
        {
          id: 3,
          start: 1,
          end: 2,
          type: 'road_medium',
          c1: { x: -33, z: 0 },
          c2: { x: 33, z: 0 },
          elevated: false,
          length: 200,
          builtDay: 0,
          zoneBlockIds: [],
        },
      ],
      buildings: [
        {
          pos: { x: 100, z: 100 },
          rotation: Math.PI / 2,
          lotW: 2,
          lotD: 3,
          defId: 'water_tower',
        },
      ],
    };
  for (const _ of mask.sync(world)) void _;
  expect(mask.blocked(0, 0)).toBe(true);
  expect(mask.blocked(0, 12)).toBe(true);
  expect(mask.blocked(0, 40)).toBe(false);
  expect(mask.blocked(120, 100)).toBe(true);
  expect(mask.blocked(80, 100)).toBe(false);
  for (const _ of mask.sync({
    ...world,
    segments: world.segments.map((s) => ({ ...s, elevated: true })),
    buildings: [],
  }))
    void _;
  expect(mask.blocked(0, 0)).toBe(false);
  expect(mask.blocked(120, 100)).toBe(false);
});
it('keeps all eight near and middle silhouettes within ART triangle budgets', () => {
  for (let species = 0; species < 8; species++)
    for (let lod = 0; lod < 3; lod++) {
      const g = vegetationGeometry(species, lod),
        triangles = (g.index?.count ?? g.getAttribute('position').count) / 3;
      expect(triangles).toBeLessThanOrEqual([400, 60, 2][lod]!);
      g.dispose();
    }
});

it('changes density through completed batches and disposes every instanced GPU buffer', () => {
  const forest = new VegetationRenderer(terrain),
    camera = new PerspectiveCamera();
  camera.position.set(0, 200, 0);
  let frames = 0;
  while (forest.readStats().pending && frames++ < 1000) forest.update(camera);
  expect(frames).toBeLessThan(1000);
  expect(forest.readStats().rendered).toBe(60000);
  expect(forest.readStats().lod0).toBeGreaterThan(0);
  forest.setQuality('low');
  frames = 0;
  while (forest.readStats().pending && frames++ < 1000) forest.update(camera);
  expect(forest.readStats().rendered).toBe(30000);
  let released = 0;
  for (const child of forest.group.children)
    if (child instanceof InstancedMesh)
      child.addEventListener('dispose', () => released++);
  forest.dispose();
  expect(released).toBe(48);
  expect(forest.group.children).toHaveLength(0);
});
