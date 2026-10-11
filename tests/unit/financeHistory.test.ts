import { describe, it, expect } from 'vitest';
import { financeHistory, financeDomain } from '../../src/world/financeHistory';
import { createState } from '../../src/sim/state';
import { WorldMirror } from '../../src/bridge/mirror';
import { serialize, deserialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
function state() {
  return createState({
    seed: 42,
    mapId: 'valley',
    mode: 'sandbox',
    cityName: 'Chart',
  });
}
describe('weekly finance history', () => {
  it('selects the latest 52 completed settlement weeks without counting repeated daily income', () => {
    const s = state(),
      rows = Array.from({ length: 425 }, (_, day) => ({
        ...s.stats,
        day,
        income: day * 10,
        expenses: day * 2,
        money: 70000 - day,
      }));
    const p = financeHistory(rows, 420);
    expect(p).toHaveLength(52);
    expect(p[0]?.week).toBe(9);
    expect(p.at(-1)).toEqual({
      week: 60,
      income: 4200,
      expenses: 840,
      money: 69580,
    });
    expect(financeHistory(rows, 6)).toEqual([]);
    expect(financeHistory(rows, 7)).toHaveLength(1);
    expect(financeHistory([{ ...s.stats, day: 7 }], 420)).toEqual([]);
  });
  it('preserves negative balances, gaps, singleton and zero domains; rejects invalid samples', () => {
    const s = state();
    const p = financeHistory(
      [
        { ...s.stats, day: 7, money: -20 },
        { ...s.stats, day: 21, money: 30 },
        { ...s.stats, day: 28, income: NaN },
      ],
      28,
    );
    expect(p.map((p) => p.week)).toEqual([1, 3]);
    expect(financeDomain(p, 'money')).toEqual([-25, 35]);
    const d = financeDomain(
      [{ week: 1, money: 0, income: 0, expenses: 0 }],
      'money',
    );
    expect(d[1]).toBeGreaterThan(d[0]);
    expect(
      financeHistory(
        [
          { ...s.stats, day: 7, money: 1 },
          { ...s.stats, day: 7, money: 2 },
        ],
        7,
      )[0]?.money,
    ).toBe(2);
  });
  it('uses actual settlement snapshots and defensive mirror data that survive saving', async () => {
    const sim = new Simulation(state().settings);
    sim.setSpeed(4);
    for (let i = 0; i < 70; i++) sim.advance(60);
    const s = sim.snapshot(),
      mirror = new WorldMirror();
    mirror.apply({ t: 'ready', reqId: 1, snapshot: s });
    const points = mirror.readFinanceHistory();
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      week: 1,
      income: s.stats.income,
      expenses: s.stats.expenses,
      money: s.stats.money,
    });
    points[0]!.money = -999;
    expect(mirror.readFinanceHistory()[0]?.money).not.toBe(-999);
    const restored = await deserialize(await serialize(s));
    expect(financeHistory(restored.statsHistory, restored.clock.day)).toEqual(
      mirror.readFinanceHistory(),
    );
    mirror.apply({
      t: 'stats',
      stats: { ...s.stats, day: 14, money: 123 },
      transient: true,
    });
    mirror.apply({ t: 'clock', clock: { ...s.clock, day: 14, ticks: 140 } });
    expect(mirror.readFinanceHistory()).toHaveLength(1);
    mirror.apply({ t: 'stats', stats: { ...s.stats, day: 14, money: 123 } });
    expect(mirror.readFinanceHistory().at(-1)?.money).toBe(123);
  });
});
