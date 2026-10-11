import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../../src/data/milestones';
import { createState } from '../../src/sim/state';
import { updateMilestones } from '../../src/sim/systems/milestones';
import { Simulation } from '../../src/sim/simulation';
import { WorldMirror } from '../../src/bridge/mirror';
import { serialize, deserialize } from '../../src/save/serializer';
import { migrateSave } from '../../src/save/migrations';
import { milestoneState } from '../fixtures/milestoneCity';
import type { SimEvent } from '../../src/bridge/protocol';
const settings = {
  seed: 409,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Milestone',
};
describe('permanent milestone rewards', () => {
  it('awards each exact threshold once, persists on a population drop, and never repays', () => {
    const s = createState(settings);
    let money = s.money;
    for (const m of MILESTONES.slice(1)) {
      s.stats.population = m.population - 1;
      expect(updateMilestones(s)).toEqual([]);
      s.stats.population++;
      expect(updateMilestones(s)).toEqual([m.id]);
      money += m.reward;
      expect(s.money).toBe(money);
      expect(s.stats.milestone).toBe(m.id);
      expect(updateMilestones(s)).toEqual([]);
      s.stats.population = 0;
      expect(updateMilestones(s)).toEqual([]);
      expect(s.stats.milestone).toBe(m.id);
    }
  });
  it('handles multiple thresholds in order and grants no sandbox bonuses', () => {
    const s = createState(settings);
    s.stats.population = 5000;
    expect(updateMilestones(s)).toEqual([1, 2, 3, 4]);
    expect(s.money).toBe(145000);
    const sandbox = createState({ ...settings, mode: 'sandbox' });
    const money = sandbox.money;
    sandbox.stats.population = 100000;
    expect(updateMilestones(sandbox)).toEqual([]);
    expect(sandbox.money).toBe(money);
    expect(sandbox.stats.milestone).toBe(10);
  });
  it('emits authority events on the first resumed tick, updates the mirror, and preserves rewards across load', async () => {
    const s = milestoneState(),
      events: SimEvent[] = [];
    const sim = new Simulation(s.settings, (e) => events.push(e), s),
      mirror = new WorldMirror();
    mirror.apply({ t: 'ready', reqId: 1, snapshot: sim.snapshot() });
    expect(sim.snapshot().stats.population).toBe(510);
    expect(sim.snapshot().unlocked).toEqual([0]);
    sim.setSpeed(1);
    sim.tick();
    expect(events.filter((e) => e.t === 'milestone')).toEqual([
      { t: 'milestone', index: 1 },
    ]);
    events.forEach((e) => mirror.apply(e));
    expect(mirror.readFinance()!.unlocked).toEqual([0, 1]);
    expect(mirror.readStats()).toMatchObject({ money: 80000, milestone: 1 });
    const saved = await deserialize(await serialize(sim.snapshot()));
    const restored = new Simulation(s.settings, undefined, saved);
    restored.tick();
    expect(restored.snapshot().money).toBe(80000);
    expect(restored.snapshot().unlocked).toEqual([0, 1]);
    for (const ids of [[0, 1, 1], [0, 100], []]) {
      const corrupt = structuredClone(saved);
      corrupt.unlocked = ids;
      expect(() => migrateSave(corrupt, 1)).toThrow();
    }
  });
});
