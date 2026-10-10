import { describe, it, expect } from 'vitest';
import { createState } from '../../src/sim/state';
import { Simulation } from '../../src/sim/simulation';
import { CommandDispatcher } from '../../src/sim/commands';
import { WorldMirror } from '../../src/bridge/mirror';
import {
  chargeConstruction,
  financeView,
  weeklyAccounts,
  loanPayment,
  settleEconomy,
  setTax,
  setBudget,
  takeLoan,
  repayLoan,
} from '../../src/sim/systems/economy';
import { updatePower } from '../../src/sim/systems/power';
import { updateWater } from '../../src/sim/systems/water';
import { districtFixture } from '../../src/render/buildings/districtFixture';
import { initialHousing } from '../../src/world/population';
import type { Building, Vec2 } from '../../src/world/types';
import type { SimEvent } from '../../src/bridge/protocol';
const settings = {
  seed: 42,
  mapId: 'valley',
  mode: 'normal' as const,
  cityName: 'Economy',
};
function state() {
  return createState(settings);
}
function building(id: number, defId = 'RL'): Building {
  return {
    ...districtFixture(1)[0]!,
    id,
    kind: 'zoned',
    defId,
    state: 'active',
    level: 1,
    lotW: 2,
    lotD: 2,
    households: 2,
    workers: 0,
    jobs: 0,
    pos: { x: 0, z: 0 },
  };
}
function week(s: ReturnType<typeof state>) {
  s.clock.day += 7;
  settleEconomy(s);
}
describe('weekly economy', () => {
  it('taxes occupied households and filled jobs only, by level and fractional rate', () => {
    const s = state(),
      home = building(1);
    home.housing = initialHousing(home, 1);
    home.housing.occupied = 1;
    s.buildings = [
      home,
      { ...building(2, 'CL'), workers: 3, jobs: 20, level: 2 },
      { ...building(3, 'I'), workers: 4 },
      { ...building(4, 'O'), workers: 2, level: 5 },
      building(5),
      { ...building(6, 'I'), state: 'construction', workers: 99 },
      { ...building(7, 'CL'), state: 'abandoned', workers: 99 },
      { ...building(8, 'RL'), state: 'burned', housing: home.housing },
    ];
    expect(weeklyAccounts(s).taxIncome).toEqual({
      RL: 1.44,
      RH: 0,
      CL: 7.02,
      CH: 0,
      I: 6.48,
      O: 11.09,
    });
    week(s);
    expect(s.stats.income).toBe(26.03);
    expect(s.money).toBe(70026.03);
    settleEconomy(s);
    expect(s.money).toBe(70026.03);
  });
  it('charges roads, elevated roads, every network edge and the correct service department', () => {
    const s = state();
    s.buildings = [
      { ...building(1, 'power_wind'), kind: 'utility' },
      { ...building(2, 'water_pump'), kind: 'utility' },
      { ...building(3, 'garbage_incinerator'), kind: 'utility' },
      { ...building(4, 'cemetery'), kind: 'service' },
      { ...building(5, 'park_small'), kind: 'park' },
    ];
    s.segments = [
      {
        id: 6,
        type: 'road_small',
        start: 0,
        end: 1,
        c1: { x: 0, z: 0 },
        c2: { x: 16, z: 0 },
        length: 16,
        elevated: true,
        builtDay: 0,
        zoneBlockIds: [],
      },
    ];
    s.networks.power = [
      {
        id: 7,
        points: [
          { x: 0, z: 0 },
          { x: 8, z: 0 },
          { x: 8, z: 8 },
        ],
      },
    ];
    s.networks.water = [
      {
        id: 8,
        points: [
          { x: 0, z: 0 },
          { x: 16, z: 0 },
        ],
      },
    ];
    s.budgets.power = 0.5;
    s.budgets.water = 1.5;
    const a = weeklyAccounts(s);
    expect(a.upkeep).toMatchObject({
      power: 32.08,
      water: 180.24,
      roads: 0.64,
      garbage: 960,
      deathcare: 120,
      parks: 24,
    });
    expect(a.expenses).toBe(1316.96);
  });
  it('uses equal principal and declining interest, pays every cent over the full term', () => {
    const s = state();
    expect(takeLoan(s, 0).ok).toBe(true);
    expect(s.money).toBe(90000);
    expect(loanPayment(s.loans[0]!)).toEqual({
      principal: 384.62,
      interest: 7.69,
      total: 392.31,
    });
    let principal = 0,
      interest = 0;
    for (let i = 0; i < 52; i++) {
      const p = loanPayment(s.loans[0]!);
      principal += p.principal;
      interest += p.interest;
      week(s);
    }
    expect(principal).toBeCloseTo(20000, 6);
    expect(s.loans).toEqual([]);
    expect(s.money).toBeCloseTo(70000 - interest, 6);
  });
  it('supports early repayment without future interest; validates limits, locks and money', () => {
    const s = state();
    expect(takeLoan(s, 2)).toMatchObject({ ok: false, reason: 'err.locked' });
    for (const bank of [-1, 0.5, NaN, 3])
      expect(takeLoan(s, bank).ok).toBe(false);
    for (let i = 0; i < 3; i++) expect(takeLoan(s, 0).ok).toBe(true);
    expect(takeLoan(s, 0).ok).toBe(false);
    expect(repayLoan(s, 0).cost).toBe(20000);
    expect(s.loans).toHaveLength(2);
    s.money = 0;
    expect(repayLoan(s, 0).ok).toBe(false);
    expect(repayLoan(s, -1).ok).toBe(false);
    s.unlocked.push(4);
    s.money = 50000;
    repayLoan(s, 0);
    expect(takeLoan(s, 2).ok).toBe(true);
  });
  it('links density tax rates until MS3; budgets require MS1 and preserve state on invalid values', () => {
    const s = state();
    expect(setTax(s, 'RL', 0.12).ok).toBe(true);
    expect(s.taxRates.RH).toBe(0.12);
    setTax(s, 'CH', 0.2);
    expect(s.taxRates.CL).toBe(0.2);
    s.unlocked.push(3);
    setTax(s, 'RH', 0.1);
    expect(s.taxRates.RL).toBe(0.12);
    expect(setBudget(s, 'power', 0.5).ok).toBe(false);
    s.unlocked.push(1);
    expect(setBudget(s, 'power', 0.5).ok).toBe(true);
    for (const n of [NaN, Infinity, 0, 0.3])
      expect(setTax(s, 'RL', n).ok).toBe(false);
    for (const n of [NaN, Infinity, 0.49, 1.51])
      expect(setBudget(s, 'power', n).ok).toBe(false);
    expect(s.taxRates.RL).toBe(0.12);
    expect(s.budgets.power).toBe(0.5);
  });
  it('scales live power and water capacity with budget, including the resulting supply flags', () => {
    const s = state();
    s.buildings = [
      { ...building(1, 'power_coal'), kind: 'utility' },
      { ...building(2, 'water_tower'), kind: 'utility' },
    ];
    updatePower(s);
    updateWater(s);
    expect(s.stats.power.produced).toBe(40);
    expect(s.stats.water.produced).toBe(6000);
    s.budgets.power = 0.5;
    s.budgets.water = 1.5;
    updatePower(s);
    updateWater(s);
    expect(s.stats.power.produced).toBe(20);
    expect(s.stats.water.produced).toBe(9000);
  });
  it('warns after four consecutive deficit weeks and freezes after eight; recovery resets the sequence', () => {
    const s = state();
    s.money = -10001;
    for (let i = 0; i < 3; i++) week(s);
    expect(s.economy.status).toBe('normal');
    week(s);
    expect(s.economy.status).toBe('warning');
    s.money = -10000;
    week(s);
    expect(s.economy).toMatchObject({ status: 'normal', distressWeeks: 0 });
    s.money = -10001;
    for (let i = 0; i < 8; i++) week(s);
    expect(s.economy.status).toBe('gameOver');
    expect(s.clock.speed).toBe(0);
    const money = s.money;
    week(s);
    expect(s.money).toBe(money);
  });
  it('sandbox reports accounts but never consumes funds or enters bankruptcy', () => {
    const s = state();
    s.settings.mode = 'sandbox';
    s.money = -20000;
    s.buildings = [{ ...building(1, 'power_coal'), kind: 'utility' }];
    expect(chargeConstruction(s, 200).ok).toBe(true);
    for (let i = 0; i < 10; i++) week(s);
    expect(s.money).toBe(-20000);
    expect(s.stats.expenses).toBe(640);
    expect(s.economy.status).toBe('normal');
    expect(takeLoan(s, 0).ok).toBe(false);
  });
  it('deducts atomically and disallows even zero-cost construction while in debt', () => {
    const s = state();
    s.money = 20;
    expect(chargeConstruction(s, 21).ok).toBe(false);
    expect(s.money).toBe(20);
    expect(chargeConstruction(s, 20).ok).toBe(true);
    expect(s.money).toBe(0);
    s.money = -0.01;
    expect(chargeConstruction(s, 0).ok).toBe(false);
    expect(chargeConstruction(s, -1).ok).toBe(false);
    expect(chargeConstruction(s, NaN).ok).toBe(false);
  });
  it('rejects malformed worker commands and mirrors acknowledged finances defensively', () => {
    const mirror = new WorldMirror(),
      events: SimEvent[] = [];
    const d = new CommandDispatcher((e) => {
      events.push(e);
      mirror.apply(e);
    });
    d.handle({ t: 'init', reqId: 1, ...settings });
    for (const command of [
      { t: 'setTax', zone: '__proto__', rate: 0.1 },
      { t: 'setBudget', dept: 'bad', value: 1 },
      { t: 'takeLoan', bank: '0' },
      { t: 'repayLoan', index: NaN },
    ]) {
      d.handle({ ...command, reqId: 2 });
      expect(events.at(-1)).toMatchObject({
        ok: false,
        reason: 'err.invalidCommand',
      });
    }
    d.handle({ t: 'takeLoan', bank: 0, reqId: 3 });
    expect(mirror.readFinance()!.money).toBe(90000);
    expect(mirror.readFinance()!.loans).toHaveLength(1);
    const f = mirror.readFinance()!;
    f.loans[0]!.remaining = 0;
    expect(mirror.readFinance()!.loans[0]!.remaining).toBe(20000);
    d.handle({ t: 'setTax', zone: 'RL', rate: 0.1, reqId: 4 });
    expect(mirror.readFinance()!.taxRates.RH).toBe(0.1);
    const s = state();
    const view = financeView(s);
    view.budgets.power = 9;
    expect(s.budgets.power).toBe(1);
  });
});
function road(sim: Simulation, a: Vec2, b: Vec2) {
  const result = sim.buildRoad('road_small', {
    start: a,
    end: b,
    c1: { x: a.x + (b.x - a.x) / 3, z: a.z + (b.z - a.z) / 3 },
    c2: { x: a.x + ((b.x - a.x) * 2) / 3, z: a.z + ((b.z - a.z) * 2) / 3 },
    elevated: false,
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
}
it('tutorial golden: real construction, migration and employment turn profitable by week four', () => {
  const sim = new Simulation(settings);
  // Controlled flat owned tile with an east river shore; no injected citizens or money.
  const off = sim.onDay((s) => {
    const size = Math.sqrt(s.terrain.heights.length);
    for (let i = 0; i < s.terrain.heights.length; i++)
      s.terrain.heights[i] = (i % size) * 16 - 2400 >= 400 ? 20 : 60;
  });
  for (let i = 0; i < 10; i++) sim.tick();
  off();
  sim.setSpeed(0);
  for (const z of [-128, 0, 128]) road(sim, { x: -320, z }, { x: 192, z });
  road(sim, { x: 192, z: -128 }, { x: 192, z: 128 });
  expect(sim.place('power_wind', { x: -336, z: 0 }, 0).ok).toBe(true);
  expect(sim.place('water_pump', { x: 382, z: -100 }, Math.PI * 1.5).ok).toBe(
    true,
  );
  expect(sim.place('water_drain', { x: 382, z: 200 }, Math.PI * 1.5).ok).toBe(
    true,
  );
  for (const net of ['power', 'water'] as const) {
    const build = (points: Vec2[]) =>
      net === 'power'
        ? sim.buildPowerLine(points)
        : sim.buildWaterPipes(points);
    const link = build([
      { x: 352, z: -200 },
      { x: 352, z: 224 },
      { x: 192, z: 224 },
      { x: 192, z: -128 },
    ]);
    expect(link.ok, JSON.stringify(link)).toBe(true);
    for (const z of [-128, 0, 128])
      expect(
        build([
          { x: 192, z },
          { x: -320, z },
        ]).ok,
      ).toBe(true);
  }
  const blocks = sim.snapshot().zoneBlocks;
  for (const block of blocks) {
    for (const zone of ['RL', 'CL', 'I'] as const) {
      const cells = [...block.cells].flatMap((v, i) => {
        const col = i % block.width;
        const type =
          block.origin.z > 130 && col < 8
            ? 'I'
            : block.origin.z > 0 && block.origin.z < 40 && col < 8
              ? 'CL'
              : 'RL';
        return v === 0 && type === zone
          ? [[block.id, i] as [number, number]]
          : [];
      });
      if (cells.length) expect(sim.zone(cells, zone).ok).toBe(true);
    }
  }
  sim.setSpeed(1);
  for (let i = 10; i < 280; i++) sim.tick();
  const s = sim.snapshot();
  expect(s.economy.settledWeek).toBe(4);
  expect(s.stats.income - s.stats.expenses).toBeGreaterThan(0);
  expect(s.stats.population).toBeGreaterThan(0);
  expect(s.stats.power.unpowered).toBe(0);
  expect(s.stats.water.unserved).toBe(0);
  expect(s.stats.sewage.uncollected).toBe(0);
  for (const zone of ['RL', 'CL', 'I'])
    expect(
      s.buildings.some((b) => b.defId === zone && b.state === 'active'),
    ).toBe(true);
  expect({
    population: s.stats.population,
    income: s.stats.income,
    expenses: s.stats.expenses,
  }).toMatchInlineSnapshot(`
    {
      "expenses": 389.28,
      "income": 702.72,
      "population": 820,
    }
  `);
  expect(
    s.buildings.filter((b) => b.kind === 'zoned' && b.state === 'abandoned'),
  ).toHaveLength(0);
}, 15_000); // Coverage on the CI runner simulates 28 full game days.

it('all construction commands reject debt atomically while demolition and free zoning remain available', () => {
  const sim = new Simulation(settings);
  let authority: ReturnType<typeof state> | undefined;
  const off = sim.onDay((s) => {
    s.terrain.heights.fill(60);
    authority = s;
  });
  for (let i = 0; i < 10; i++) sim.tick();
  off();
  road(sim, { x: -240, z: 0 }, { x: 80, z: 0 });
  authority!.money = -1;
  const before = sim.snapshot();
  const operations = [
    () =>
      sim.buildRoad('road_small', {
        start: { x: 0, z: 80 },
        end: { x: 160, z: 80 },
        c1: { x: 160 / 3, z: 80 },
        c2: { x: 320 / 3, z: 80 },
        elevated: false,
      }),
    () => sim.place('power_wind', { x: 160, z: -80 }, 0),
    () => sim.place('water_tower', { x: 160, z: -80 }, 0),
    () =>
      sim.buildPowerLine([
        { x: -160, z: -80 },
        { x: 160, z: -80 },
      ]),
    () =>
      sim.buildWaterPipes([
        { x: -160, z: -80 },
        { x: 160, z: -80 },
      ]),
    () => sim.buildWaterPipes(),
  ];
  for (const operation of operations)
    expect(operation()).toMatchObject({
      ok: false,
      reason: 'err.notEnoughMoney',
    });
  const after = sim.snapshot();
  expect(after.nextId).toBe(before.nextId);
  expect(after.money).toBe(-1);
  expect(after.buildings).toEqual(before.buildings);
  expect(after.networks).toEqual(before.networks);
  const block = after.zoneBlocks[0]!,
    cell = [...block.cells].findIndex((v) => v === 0);
  expect(sim.zone([[block.id, cell]], 'RL').ok).toBe(true);
  expect(
    sim.bulldoze([{ kind: 'segment', id: before.segments[0]!.id }]).ok,
  ).toBe(true);
  expect(sim.snapshot().segments).toHaveLength(0);
});
it('weekly settlement stops after terminal bankruptcy and speed commands cannot resume it', () => {
  const sim = new Simulation(settings);
  const off = sim.onDay((s) => (s.money = -10001));
  for (let i = 0; i < 560; i++) sim.tick();
  off();
  expect(sim.gameOver).toBe(true);
  const clock = sim.readClock();
  const funds = sim.snapshot().money;
  sim.setSpeed(4);
  sim.advance(2400);
  sim.tick();
  expect(sim.readClock()).toEqual(clock);
  expect(sim.snapshot().money).toBe(funds);
  expect(sim.finance({ t: 'takeLoan', bank: 0 })).toMatchObject({
    ok: false,
    reason: 'err.gameOver',
  });
  expect(sim.bulldoze([])).toMatchObject({ ok: false, reason: 'err.gameOver' });
  expect(sim.zone([], null)).toMatchObject({
    ok: false,
    reason: 'err.gameOver',
  });
});
