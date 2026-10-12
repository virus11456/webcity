import { afterEach, expect, it, vi } from 'vitest';
import { createState } from '../../src/sim/state';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { parkField } from '../../src/sim/systems/parks';
import * as geometry from '../../src/world/zoneGeometry';
import { referenceParkField } from '../fixtures/referenceParkField';
import { PERFORMANCE } from '../../src/data/performance';

function fixture(trees = 80) {
  const s = createState({
    seed: 23,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: 'Park cache',
  });
  const base = districtFixture(1)[0]!;
  s.budgets.parks = 1.37;
  s.buildings = Array.from({ length: trees + 2 }, (_, i) => ({
    ...structuredClone(base),
    id: i + 1,
    defId: i < trees ? 'tree' : i === trees ? 'park_small' : 'park_large',
    kind: 'park' as const,
    state: 'active' as const,
    pos: { x: (i % 7) * 1.125 - 3, z: (i % 11) * 1.75 - 4 },
    lotW: i < trees ? 1 : 4,
    lotD: i < trees ? 1 : 3,
    rotation: i / 17,
  }));
  return s;
}
afterEach(() => vi.restoreAllMocks());
it('preserves exact Float32 rasterization and isolates every returned array', () => {
  const s = fixture(),
    expected = referenceParkField(s);
  const footprint = vi.spyOn(geometry, 'zoneBuildingFootprint');
  const first = parkField(s);
  expect(first).toEqual(expected);
  expect(footprint).toHaveBeenCalledTimes(s.buildings.length);
  footprint.mockClear();
  first.fill(999); // A consumer must not corrupt the private retained field.
  const second = parkField(s);
  expect(second).toEqual(expected);
  expect(footprint).not.toHaveBeenCalled();
  expect(second).not.toBe(first);
  second.fill(-1);
  expect(parkField(s)).toEqual(expected);
});
const mutations: [string, (s: ReturnType<typeof fixture>) => void][] = [
  [
    'budget',
    (s) => {
      s.budgets.parks = 0.63;
    },
  ],
  [
    'zero budget',
    (s) => {
      s.budgets.parks = 0;
    },
  ],
  [
    'x',
    (s) => {
      s.buildings[0]!.pos.x += 100;
    },
  ],
  [
    'z',
    (s) => {
      s.buildings[0]!.pos.z -= 130;
    },
  ],
  [
    'rotation',
    (s) => {
      s.buildings[0]!.rotation += 1;
    },
  ],
  [
    'width',
    (s) => {
      s.buildings[0]!.lotW += 2;
    },
  ],
  [
    'depth',
    (s) => {
      s.buildings[0]!.lotD += 2;
    },
  ],
  [
    'definition',
    (s) => {
      s.buildings[0]!.defId = 'park_large';
    },
  ],
  [
    'disabled',
    (s) => {
      s.buildings[0]!.enabled = false;
    },
  ],
  [
    'burning',
    (s) => {
      s.buildings[0]!.fire = { burning: true, damage: 1, startedDay: 0 };
    },
  ],
  [
    'abandoned',
    (s) => {
      s.buildings[0]!.state = 'abandoned';
    },
  ],
  [
    'removed',
    (s) => {
      s.buildings.shift();
    },
  ],
  [
    'added',
    (s) => {
      s.buildings.push({
        ...structuredClone(s.buildings[0]!),
        id: 9999,
        pos: { x: 200, z: 100 },
      });
    },
  ],
  [
    'order',
    (s) => {
      s.buildings.reverse();
    },
  ],
  [
    'resolution',
    (s) => {
      s.fields.size = 17;
    },
  ],
];
it.each(mutations)('invalidates on in-place %s changes', (_name, mutate) => {
  const s = fixture();
  parkField(s);
  mutate(s);
  const expected = referenceParkField(s);
  const footprint = vi.spyOn(geometry, 'zoneBuildingFootprint');
  expect(parkField(s)).toEqual(expected);
  if (s.budgets.parks) expect(footprint).toHaveBeenCalled();
  footprint.mockClear();
  expect(parkField(s)).toEqual(expected);
  expect(footprint).not.toHaveBeenCalled();
});
it('rebuilds when sources reactivate and when loading an independent world', () => {
  const s = fixture(1);
  s.buildings[0]!.enabled = false;
  parkField(s);
  s.buildings[0]!.enabled = true;
  expect(parkField(s)).toEqual(referenceParkField(s));
  const other = fixture(1);
  other.buildings[0]!.pos.x = 900;
  expect(parkField(other)).toEqual(referenceParkField(other));
  expect(parkField(s)).toEqual(referenceParkField(s));
});
it('handles empty parks and ignores unrelated residential edits', () => {
  const s = fixture(0);
  s.buildings.length = 0;
  expect(parkField(s).every((v) => v === 0)).toBe(true);
  s.buildings.push({ ...structuredClone(districtFixture(1)[0]!), defId: 'RH' });
  const footprint = vi.spyOn(geometry, 'zoneBuildingFootprint');
  expect(parkField(s).every((v) => v === 0)).toBe(true);
  s.buildings[0]!.pos.x += 10;
  expect(parkField(s).every((v) => v === 0)).toBe(true);
  expect(footprint).not.toHaveBeenCalled();
});
it('releases the prior entry and computes exactly when grid or source limits are exceeded', () => {
  const s = fixture(1);
  parkField(s);
  s.fields.size = Math.floor(Math.sqrt(PERFORMANCE.parkFieldMaxBytes / 4)) + 1;
  expect(parkField(s)).toEqual(referenceParkField(s));
  const footprint = vi.spyOn(geometry, 'zoneBuildingFootprint');
  parkField(s);
  expect(footprint).toHaveBeenCalledTimes(3);
  s.fields.size = 17;
  s.buildings = Array.from(
    { length: PERFORMANCE.parkFieldMaxSources + 1 },
    (_, i) => ({ ...s.buildings[0]!, id: i + 1 }),
  );
  expect(parkField(s)).toEqual(referenceParkField(s));
  footprint.mockClear();
  parkField(s);
  expect(footprint).toHaveBeenCalledTimes(s.buildings.length);
  s.buildings.length = 1;
  parkField(s);
  footprint.mockClear();
  parkField(s);
  expect(footprint).not.toHaveBeenCalled();
});
