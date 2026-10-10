import { it, expect } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { CityEffects } from '../../src/render/effects';
import { FireRenderer } from '../../src/render/fire';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { CITY_EFFECTS } from '../../src/data/effects';
it('bounds per-factory particles, stops disabled/burning sources, culls distant plumes and switches quality immediately', () => {
  const root = new Group(),
    effects = new CityEffects(
      root,
      (_id, out) => {
        out.set(0, 20, 0);
        return true;
      },
      () => 0,
    ),
    camera = new PerspectiveCamera();
  camera.position.set(0, 60, 80);
  const base = districtFixture(1)[0]!,
    buildings = Array.from({ length: 100 }, (_, i) => ({
      ...structuredClone(base),
      id: i + 1,
      defId: 'I',
      state: 'active' as const,
      enabled: true,
    }));
  effects.reset(buildings);
  effects.update(0.1, camera);
  expect(effects.readStats().smoke).toBe(CITY_EFFECTS.maxEmitters * 40);
  effects.setQuality('medium');
  effects.update(0.1, camera);
  expect(effects.readStats().smoke).toBe(CITY_EFFECTS.maxEmitters * 16);
  effects.setQuality('low');
  expect(effects.readStats().smoke).toBe(0);
  effects.update(0.1, camera);
  expect(effects.readStats().smoke).toBe(0);
  effects.reset([buildings[0]!]);
  effects.setQuality('high');
  effects.accept({
    t: 'buildingsChanged',
    added: [],
    removed: [],
    updated: [{ id: 1, enabled: false }],
  });
  effects.update(0.1, camera);
  expect(effects.readStats().smoke).toBe(0);
  effects.accept({
    t: 'buildingsChanged',
    added: [],
    removed: [],
    updated: [
      {
        id: 1,
        enabled: true,
        fire: { burning: true, damage: 0, startedDay: 0 },
      },
    ],
  });
  effects.update(0.1, camera);
  expect(effects.readStats().smoke).toBe(0);
  effects.accept({
    t: 'buildingsChanged',
    added: [],
    removed: [],
    updated: [{ id: 1, fire: { burning: false, damage: 0, startedDay: 0 } }],
  });
  effects.update(0.1, camera);
  expect(effects.readStats().smoke).toBe(40);
  camera.position.set(0, 2000, 0);
  effects.update(0.1, camera);
  expect(effects.readStats().smoke).toBe(0);
  effects.dispose();
  expect(root.children).toHaveLength(0);
});
it('only emits a bounded upgrade ring from authoritative completion and expires it after 0.8 seconds', () => {
  const effects = new CityEffects(
      new Group(),
      (_id, out) => {
        out.set(0, 20, 0);
        return true;
      },
      () => 0,
    ),
    camera = new PerspectiveCamera(),
    b = {
      ...districtFixture(1)[0]!,
      id: 1,
      level: 2,
      state: 'construction' as const,
    };
  effects.reset([b]);
  effects.update(0.1, camera);
  expect(effects.readStats().halos).toBe(0);
  effects.accept({
    t: 'buildingsChanged',
    added: [],
    removed: [],
    updated: [{ id: 1, state: 'active' }],
  });
  effects.update(0.1, camera);
  expect(effects.readStats().halos).toBe(1);
  effects.accept({
    t: 'buildingsChanged',
    added: [],
    removed: [],
    updated: [{ id: 1, state: 'active' }],
  });
  effects.update(0.1, camera);
  expect(effects.readStats().halos).toBe(1);
  effects.update(0.61, camera);
  expect(effects.readStats().halos).toBe(0);
  effects.accept({
    t: 'buildingsChanged',
    added: [],
    removed: [],
    updated: [{ id: 1, level: 3 }],
  });
  effects.update(0.1, camera);
  expect(effects.readStats().halos).toBe(1);
  effects.setQuality('low');
  expect(effects.readStats().halos).toBe(0);
  effects.dispose();
});
it('hides fire particles at low quality while retaining the fire record for re-enabling', () => {
  const fire = new FireRenderer(
      new Group(),
      () => 0,
      (_id, out) => {
        out.set(20, 70, 30);
        return true;
      },
    ),
    camera = new PerspectiveCamera(),
    b = {
      ...districtFixture(1)[0]!,
      state: 'active' as const,
      fire: { burning: true, damage: 0, startedDay: 0 },
    };
  fire.reset([b]);
  fire.update(0.1, camera);
  expect(fire.readStats().sprites).toBe(1);
  expect(fire.geometry.getAttribute('anchor').getY(0)).toBe(66);
  fire.setEnabled(false);
  fire.update(0.1, camera);
  expect(fire.readStats().sprites).toBe(0);
  fire.setEnabled(true);
  fire.update(0.1, camera);
  expect(fire.readStats().sprites).toBe(1);
  fire.dispose();
});

import { Scene, Mesh, MeshStandardMaterial, Color } from 'three';
import { PowerRenderer } from '../../src/render/power';
import { WaterUtilityRenderer } from '../../src/render/waterUtilities';
import { FIRE_PALETTE } from '../../src/data/palette';
it('updates power and water model charring from acknowledged fire patches without rebuilding on each damage tick', () => {
  for (const [defId, create] of [
    ['power_coal', () => new PowerRenderer(new Scene(), () => 60)],
    ['water_tower', () => new WaterUtilityRenderer(new Scene(), () => 60)],
  ] as const) {
    const r = create(),
      b = {
        ...districtFixture(1)[0]!,
        id: 1,
        defId,
        kind: 'utility' as const,
        state: 'active' as const,
        lotW: 4,
        lotD: 4,
      };
    r.accept({ t: 'buildingsChanged', added: [b], updated: [], removed: [] });
    r.accept({
      t: 'buildingsChanged',
      added: [],
      updated: [{ id: 1, fire: { burning: true, damage: 1, startedDay: 0 } }],
      removed: [],
    });
    let charred = 0;
    const expected = new Color(FIRE_PALETTE.char);
    r.group.traverse((o) => {
      if (
        o instanceof Mesh &&
        o.material instanceof MeshStandardMaterial &&
        o.material.color.equals(expected)
      )
        charred++;
    });
    expect(charred).toBeGreaterThan(0);
    const meshes = r.group.children.slice();
    r.accept({
      t: 'buildingsChanged',
      added: [],
      updated: [{ id: 1, fire: { burning: true, damage: 2, startedDay: 0 } }],
      removed: [],
    });
    expect(r.group.children).toEqual(meshes);
    r.accept({ t: 'buildingsChanged', added: [], updated: [], removed: [1] });
    r.dispose();
  }
});
