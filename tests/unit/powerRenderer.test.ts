import { it, expect, vi } from 'vitest';
import { Scene, Mesh, LineSegments, Group } from 'three';
import { SEA_LEVEL } from '../../src/data/config';
import { POWER } from '../../src/data/power';
import { PowerRenderer } from '../../src/render/power';
import { Simulation } from '../../src/sim/simulation';
it('renders actual plants and lines, animates the rotor and disposes replaced geometry', () => {
  const scene = new Scene(),
    renderer = new PowerRenderer(scene, () => 60);
  const sim = new Simulation({
    seed: 72,
    mapId: 'valley',
    mode: 'normal',
    cityName: 'Render',
  });
  sim.place('power_wind', { x: -200, z: -180 }, Math.PI / 2);
  sim.buildPowerLine([
    { x: -190, z: -180 },
    { x: -90, z: -180 },
  ]);
  const snapshot = sim.snapshot();
  renderer.accept({ t: 'ready', reqId: 1, snapshot });
  expect(renderer.group.children.length).toBe(3);
  const meshes: Mesh[] = [],
    groups: Group[] = [];
  renderer.group.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
    if (o instanceof Group) groups.push(o);
  });
  expect(meshes.length).toBeGreaterThan(6);
  const angles = groups.map((g) => g.rotation.z);
  renderer.update(0.05);
  expect(groups.map((g) => g.rotation.z)).not.toEqual(angles);
  const disposal: ReturnType<typeof vi.spyOn>[] = [];
  renderer.group.traverse((o) => {
    if (o instanceof Mesh || o instanceof LineSegments)
      disposal.push(vi.spyOn(o.geometry, 'dispose'));
  });
  renderer.accept({ t: 'ready', reqId: 2, snapshot });
  expect(disposal.every((f) => f.mock.calls.length === 1)).toBe(true);
  expect(renderer.group.children.length).toBe(3);
  renderer.accept({
    t: 'networksChanged',
    net: 'power',
    added: [],
    removed: snapshot.networks.power.map((n) => n.id),
  });
  expect(renderer.group.children.length).toBe(2);
  renderer.dispose();
  expect(scene.children).toHaveLength(0);
});

it('keeps cross-water cables and their preview above the water surface', () => {
  const renderer = new PowerRenderer(new Scene(), () => SEA_LEVEL - 30);
  const points = [
    { x: 0, z: 0 },
    { x: 64, z: 0 },
  ];
  renderer.accept({
    t: 'networksChanged',
    net: 'power',
    added: [{ id: 1, points }],
    removed: [],
  });
  renderer.show({
    points,
    closed: false,
    valid: true,
    reason: null,
    cost: 80,
    output: 0,
  });
  const heights: number[][] = [];
  renderer.group.traverse((o) => {
    if (o instanceof LineSegments) {
      const p = o.geometry.getAttribute('position');
      heights.push(Array.from({ length: p.count }, (_, i) => p.getY(i)));
    }
  });
  // Actual wires and the elevated preview each clear the water by tower height.
  expect(
    heights.filter((ys) =>
      ys.every((y) => y === SEA_LEVEL + POWER.towerHeightM),
    ),
  ).toHaveLength(2);
  expect(heights.every((ys) => ys.every((y) => y > SEA_LEVEL))).toBe(true);
  renderer.dispose();
});
