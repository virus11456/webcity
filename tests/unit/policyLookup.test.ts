import { expect, it } from 'vitest';
import { POLICIES, type PolicyId } from '../../src/data/policies';
import {
  districtAt,
  districtPoint,
  paintDistrict,
} from '../../src/world/districts';
import { hasPolicy, type PolicyWorld } from '../../src/world/policies';
import type { Vec2 } from '../../src/world/types';

const reference = (s: PolicyWorld, id: PolicyId, pos: Vec2) => {
  const district = s.districts.find(
    (d) => d.id === districtAt(s.districts, pos),
  );
  return district?.policies?.[id] ?? s.policies.includes(id);
};
const makeWorld = (count: number): PolicyWorld => ({
  policies: ['education_campaign', 'energy_saving'],
  districts: Array.from({ length: count }, (_, i) => ({
    id: 2147483647 - i,
    name: `District ${i}`,
    cells: [i],
    policies:
      i % 3 === 0
        ? { education_campaign: false }
        : i % 3 === 1
          ? { recycling_plan: true }
          : {},
  })),
});

it.each([0, 1, 16, 64])(
  'matches policy inheritance and overrides with %i districts',
  (count) => {
    const s = makeWorld(count),
      before = structuredClone(s);
    const points = [
      ...Array.from({ length: 65 }, (_, i) => districtPoint(i)),
      { x: -2401, z: 0 },
      { x: 2400, z: 0 },
      { x: 0, z: -2401 },
      { x: 0, z: 2400 },
    ];
    for (const pos of points)
      for (const p of POLICIES)
        expect(hasPolicy(s, p.id, pos)).toBe(reference(s, p.id, pos));
    expect(s).toEqual(before);
  },
);

it('reflects city and district policy edits without retaining a previous answer', () => {
  const s = makeWorld(3),
    pos = districtPoint(2);
  expect(hasPolicy(s, 'education_campaign', pos)).toBe(true);
  s.policies = [];
  expect(hasPolicy(s, 'education_campaign', pos)).toBe(false);
  s.districts[2]!.policies = { education_campaign: true };
  expect(hasPolicy(s, 'education_campaign', pos)).toBe(true);
  s.districts[2]!.policies = { education_campaign: false };
  expect(hasPolicy(s, 'education_campaign', pos)).toBe(false);
  s.policies = ['education_campaign'];
  s.districts[2]!.policies = {};
  expect(hasPolicy(s, 'education_campaign', pos)).toBe(true);
});

it('follows overlapping ownership, repainting and removal using replacement district collections', () => {
  const s = makeWorld(2),
    pos = districtPoint(0);
  s.districts = s.districts.map((d) => ({ ...d, cells: [0] }));
  expect(hasPolicy(s, 'education_campaign', pos)).toBe(true);
  s.districts = paintDistrict(s.districts, s.districts[0]!.id, [0]);
  expect(hasPolicy(s, 'education_campaign', pos)).toBe(false);
  s.districts = s.districts.slice(1);
  expect(hasPolicy(s, 'education_campaign', pos)).toBe(true);
});
