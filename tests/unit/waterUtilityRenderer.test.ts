import { it, expect, vi } from 'vitest';
import { Scene, Mesh, LineSegments } from 'three';
import { WaterUtilityRenderer } from '../../src/render/waterUtilities';
import { Simulation } from '../../src/sim/simulation';
import { WATER_UTILITY as W } from '../../src/data/waterUtility';
it('renders utility models and batched underground pipes and releases replaced buffers', () => {
  const scene = new Scene(),
    renderer = new WaterUtilityRenderer(scene, () => 60),
    sim = new Simulation({
      seed: 72,
      mapId: 'valley',
      mode: 'normal',
      cityName: 'Water',
    });
  sim.place('water_tower', { x: -200, z: -180 }, 0);
  sim.buildWaterPipes([
    { x: -200, z: -180 },
    { x: -80, z: -180 },
  ]);
  const snapshot = sim.snapshot();
  renderer.accept({ t: 'ready', reqId: 1, snapshot });
  expect(renderer.group.children.length).toBe(3);
  expect(renderer.pipes.visible).toBe(false);
  renderer.setUnderground(true);
  expect(renderer.pipes.visible).toBe(true);
  const disposal: ReturnType<typeof vi.spyOn>[] = [];
  renderer.group.traverse((o) => {
    if (o instanceof Mesh || o instanceof LineSegments)
      disposal.push(vi.spyOn(o.geometry, 'dispose'));
  });
  const pipes = renderer.pipes.children.filter((o) => o instanceof Mesh);
  expect(pipes).toHaveLength(2);
  for (const p of pipes) {
    const positions = p.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      expect(positions.getY(i)).toBe(60 - W.undergroundDepthM);
  }
  renderer.accept({ t: 'ready', reqId: 2, snapshot });
  expect(disposal.every((f) => f.mock.calls.length === 1)).toBe(true);
  renderer.accept({
    t: 'buildingsChanged',
    added: [],
    removed: snapshot.buildings.map((b) => b.id),
    updated: [],
  });
  expect(renderer.group.children.length).toBe(2);
  renderer.dispose();
  expect(scene.children).toHaveLength(0);
});
