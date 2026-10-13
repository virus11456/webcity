import { deepStrictEqual } from 'node:assert/strict';
import { expect, it } from 'vitest';
import { mergeBuildingPatches } from '../../src/sim/buildingPatches';
import type { BuildingPatch } from '../../src/world/snapshot';
import { buildingPatchBatch } from '../fixtures/buildingPatchBatch';
import { busState } from '../fixtures/busCity';
import { Simulation } from '../../src/sim/simulation';
import type { SimEvent } from '../../src/bridge/protocol';
import { TIME } from '../../src/data/config';

it('keeps first-seen building order and merges interleaved IDs including large IDs', () => {
  expect(mergeBuildingPatches([])).toEqual([]);
  expect(
    mergeBuildingPatches([
      { id: 2147483647, residents: 3 },
      { id: 2, residents: 4 },
      { id: 2147483647, workers: 1 },
      { id: 1, residents: 0 },
      { id: 2, residents: 0 },
    ]),
  ).toEqual([
    { id: 2147483647, residents: 3, workers: 1 },
    { id: 2, residents: 0 },
    { id: 1, residents: 0 },
  ]);
});

it('replaces nested summaries and preserves explicit undefined, false and zero updates', () => {
  const patches: BuildingPatch[] = [
    {
      id: 1,
      coverage: { police: 1, fire: 1 },
      enabled: true,
      roadDisconnectedDay: 2,
      bodies: { pending: 4 },
    },
    {
      id: 1,
      coverage: { police: 0 },
      enabled: false,
      roadDisconnectedDay: undefined,
      bodies: undefined,
    },
  ];
  const [merged] = mergeBuildingPatches(patches);
  expect(merged).toEqual(patches[1]);
  expect(Object.hasOwn(merged!, 'bodies')).toBe(true);
  expect(Object.keys(merged!)).toEqual(
    Object.keys({ ...patches[0], ...patches[1] }),
  );
});

it('does not mutate source records or share merged top-level records across calls', () => {
  const first = Object.freeze({ id: 1, residents: 5 }),
    last = Object.freeze({ id: 1, workers: 2 });
  const patches = Object.freeze([first, last]);
  const a = mergeBuildingPatches(patches),
    b = mergeBuildingPatches(patches);
  a[0]!.residents = 9;
  expect(first.residents).toBe(5);
  expect(b[0]!.residents).toBe(5);
  expect(mergeBuildingPatches([first])[0]).not.toBe(first);
});

it('matches the previous ordered spread algorithm for a full daily-style patch batch', () => {
  const patches = buildingPatchBatch(),
    before = structuredClone(patches),
    reference = new Map<number, BuildingPatch>();
  for (const p of patches)
    reference.set(p.id, { ...reference.get(p.id), ...p });
  const actual = mergeBuildingPatches(patches);
  deepStrictEqual(actual, [...reference.values()]);
  expect(JSON.stringify(actual)).toBe(JSON.stringify([...reference.values()]));
  deepStrictEqual(patches, before);
});

it.each(['daily', 'paused refresh'] as const)(
  'keeps emitted %s building updates isolated from worker state',
  (mode) => {
    const s = busState(),
      events: Extract<SimEvent, { t: 'buildingsChanged' }>[] = [];
    let collecting = true;
    const sim = new Simulation(
      s.settings,
      (event) => {
        if (collecting && event.t === 'buildingsChanged') events.push(event);
      },
      s,
    );
    events.length = 0;
    if (mode === 'daily') {
      sim.setSpeed(1);
      for (let i = 0; i < TIME.ticksPerDay - 1; i++) sim.tick();
      events.length = 0;
      // Capture the daily callback only; per-tick field/cargo events use other paths.
      sim.onDay(() => {
        collecting = false;
      });
      sim.tick();
    } else {
      sim.setSpeed(0);
      expect(
        sim.finance({ t: 'setBudget', dept: 'health', value: 0.5 }).ok,
      ).toBe(true);
    }
    expect(events.some((event) => event.updated.length > 0)).toBe(true);
    const before = sim.snapshot();
    for (const event of events)
      for (const p of event.updated) {
        p.residents = -999;
        if (p.coverage) p.coverage.health = -1;
        if (p.health) p.health.average = -1;
        if (p.housing) p.housing.education.fill(-1);
        if (p.environment) p.environment.noise = -1;
      }
    deepStrictEqual(sim.snapshot(), before);
  },
);
