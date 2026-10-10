import { distance } from '../../core/math';
import { CELL_SIZE, GAME_MODES, TIME } from '../../data/config';
import {
  BUILDINGS,
  TRANSIT,
  NETWORKS,
  type BuildingDefinition,
} from '../../data/buildings';
import {
  ECONOMY,
  LOANS,
  BUDGET_DEPARTMENTS,
  type BudgetDepartment,
} from '../../data/economy';
import { ROADS, ROAD_RULES } from '../../data/roads';
import { ZONES, type ZoneType } from '../../data/zones';
import type { FinanceView, WorldSnapshot } from '../../world/snapshot';
import type { SimState } from '../state';
import type { Result } from '../../bridge/protocol';

type Outcome = Omit<Result, 't' | 'reqId'>;
const definitions = new Map<string, BuildingDefinition>(
  BUILDINGS.map((d) => [d.id, d]),
);
export const moneyRound = (n: number): number =>
  Math.round(n * ECONOMY.currencyScale) / ECONOMY.currencyScale;
export function financeView(s: SimState): FinanceView {
  return structuredClone({
    money: s.money,
    loans: s.loans,
    taxRates: s.taxRates,
    budgets: s.budgets,
    economy: s.economy,
    unlocked: s.unlocked,
    sandbox: GAME_MODES[s.settings.mode].unlimitedMoney,
  });
}
/** Validate before allocating IDs or changing geometry. Free zoning is still possible in debt. */
export function chargeConstruction(s: SimState, cost: number): Outcome {
  if (!Number.isFinite(cost) || cost < 0)
    return { ok: false, reason: 'err.invalidCommand' };
  if (s.economy.status === 'gameOver')
    return { ok: false, reason: 'err.gameOver' };
  if (GAME_MODES[s.settings.mode].unlimitedMoney) return { ok: true, cost: 0 };
  if (s.money < 0 || s.money < cost)
    return { ok: false, reason: 'err.notEnoughMoney' };
  s.money = moneyRound(s.money - cost);
  s.stats.money = s.money;
  return { ok: true, cost };
}
/** Equal principal each week; interest is charged only on the outstanding principal. */
export function loanPayment(loan: WorldSnapshot['loans'][number]) {
  const principal =
    loan.weeksLeft <= 1
      ? loan.remaining
      : moneyRound(loan.remaining / loan.weeksLeft);
  const interest = moneyRound(
    (loan.remaining * LOANS[loan.bank]!.annualInterest) / ECONOMY.weeksPerYear,
  );
  return { principal, interest, total: moneyRound(principal + interest) };
}
export function weeklyAccounts(s: SimState) {
  const taxIncome = Object.fromEntries(
    Object.keys(ZONES).map((z) => [z, 0]),
  ) as SimState['taxRates'];
  const upkeep = Object.fromEntries(
    BUDGET_DEPARTMENTS.map((d) => [d, 0]),
  ) as SimState['budgets'];
  for (const b of s.buildings) {
    if (b.state !== 'active') continue;
    if (b.kind === 'zoned') {
      if (!Object.hasOwn(ZONES, b.defId)) continue;
      const zone = b.defId as ZoneType;
      const residential = zone === 'RL' || zone === 'RH';
      const units = residential ? (b.housing?.occupied ?? 0) : b.workers;
      const rate = residential
        ? ECONOMY.incomePerWeek.household
        : zone === 'I'
          ? ECONOMY.incomePerWeek.industrialJob
          : zone === 'O'
            ? ECONOMY.incomePerWeek.officeJob
            : ECONOMY.incomePerWeek.commercialJob;
      taxIncome[zone] +=
        units *
        rate *
        ECONOMY.levelMultipliers[b.level - 1]! *
        s.taxRates[zone];
    } else {
      const d = definitions.get(b.defId);
      if (!d) continue;
      const dept: BudgetDepartment = d.garbage
        ? 'garbage'
        : d.power
          ? 'power'
          : d.water
            ? 'water'
            : (d.service ?? 'parks');
      if (b.enabled !== false) upkeep[dept] += d.upkeepPerWeek;
    }
  }
  for (const r of s.segments.filter((road) => !road.regional))
    upkeep.roads +=
      (r.length / CELL_SIZE) *
      ROADS[r.type].upkeepPer8MWeek *
      (r.elevated ? ROAD_RULES.elevatedUpkeepMultiplier : 1);
  for (const net of ['power', 'water'] as const) {
    const unit = NETWORKS.find(
      (n) => n.id === (net === 'power' ? 'power_line' : 'water_pipe'),
    )!.upkeepPer8MWeek!;
    for (const n of s.networks[net])
      for (let i = 1; i < n.points.length; i++)
        upkeep[net] +=
          (distance(n.points[i - 1]!, n.points[i]!) / CELL_SIZE) * unit;
  }
  upkeep.transit += s.transitLines.reduce(
    (sum, line) =>
      sum + (line.blocked ? 0 : line.buses.length) * TRANSIT.busUpkeepPerWeek,
    0,
  );
  for (const z of Object.keys(taxIncome) as ZoneType[])
    taxIncome[z] = moneyRound(taxIncome[z]);
  for (const dept of BUDGET_DEPARTMENTS)
    upkeep[dept] = moneyRound(upkeep[dept] * s.budgets[dept]);
  const debtPayment = moneyRound(
    s.loans.reduce((sum, loan) => sum + loanPayment(loan).total, 0),
  );
  return {
    taxIncome,
    upkeep,
    debtPayment,
    income: moneyRound(
      Object.values(taxIncome).reduce(
        (a, b) => a + b,
        s.economy.transitUnsettled ?? 0,
      ),
    ),
    expenses: moneyRound(
      Object.values(upkeep).reduce((a, b) => a + b, debtPayment),
    ),
  };
}
export function settleEconomy(s: SimState): void {
  const week = Math.floor(s.clock.day / TIME.fiscalPeriodDays);
  if (week <= s.economy.settledWeek || s.economy.status === 'gameOver') return;
  const a = weeklyAccounts(s);
  s.economy = {
    ...s.economy,
    settledWeek: week,
    transitIncome: s.economy.transitUnsettled ?? 0,
    transitUnsettled: 0,
    taxIncome: a.taxIncome,
    upkeep: a.upkeep,
    debtPayment: a.debtPayment,
  };
  s.stats.income = a.income;
  s.stats.expenses = a.expenses;
  if (GAME_MODES[s.settings.mode].unlimitedMoney) return;
  s.money = moneyRound(s.money + a.income - a.expenses);
  s.stats.money = s.money;
  s.loans = s.loans
    .map((loan) => ({
      ...loan,
      remaining: moneyRound(loan.remaining - loanPayment(loan).principal),
      weeksLeft: loan.weeksLeft - 1,
    }))
    .filter((loan) => loan.weeksLeft > 0 && loan.remaining > 0);
  const b = ECONOMY.bankruptcy;
  s.economy.distressWeeks =
    s.money < b.balanceThreshold ? s.economy.distressWeeks + 1 : 0;
  s.economy.status =
    s.economy.distressWeeks >= b.warningWeeks + b.additionalWeeksToGameOver
      ? 'gameOver'
      : s.economy.distressWeeks >= b.warningWeeks
        ? 'warning'
        : 'normal';
  if (s.economy.status === 'gameOver') s.clock.speed = 0;
}
export function setTax(s: SimState, zone: ZoneType, rate: number): Outcome {
  if (
    !Object.hasOwn(ZONES, zone) ||
    !Number.isFinite(rate) ||
    rate < ECONOMY.taxRate.min ||
    rate > ECONOMY.taxRate.max
  )
    return { ok: false, reason: 'err.invalidCommand' };
  s.taxRates[zone] = rate;
  if (!s.unlocked.includes(ECONOMY.separateTaxUnlock)) {
    if (zone === 'RL' || zone === 'RH') s.taxRates.RL = s.taxRates.RH = rate;
    if (zone === 'CL' || zone === 'CH') s.taxRates.CL = s.taxRates.CH = rate;
  }
  return { ok: true };
}
export function setBudget(
  s: SimState,
  dept: BudgetDepartment,
  value: number,
): Outcome {
  if (
    !BUDGET_DEPARTMENTS.includes(dept) ||
    !Number.isFinite(value) ||
    value < ECONOMY.budget.min ||
    value > ECONOMY.budget.max
  )
    return { ok: false, reason: 'err.invalidCommand' };
  if (!s.unlocked.includes(ECONOMY.budgetUnlock))
    return { ok: false, reason: 'err.locked' };
  s.budgets[dept] = value;
  return { ok: true };
}
export function takeLoan(s: SimState, bank: number): Outcome {
  if (!Number.isInteger(bank) || !LOANS[bank])
    return { ok: false, reason: 'err.invalidCommand' };
  const d = LOANS[bank]!;
  if (!s.unlocked.includes(d.unlock))
    return { ok: false, reason: 'err.locked' };
  if (
    GAME_MODES[s.settings.mode].unlimitedMoney ||
    s.loans.length >= ECONOMY.maxLoans
  )
    return { ok: false, reason: 'err.loanLimit' };
  s.loans.push({ bank, remaining: d.amount, weeksLeft: d.termWeeks });
  s.money = moneyRound(s.money + d.amount);
  s.stats.money = s.money;
  return { ok: true };
}
export function repayLoan(s: SimState, index: number): Outcome {
  if (!Number.isInteger(index) || !s.loans[index])
    return { ok: false, reason: 'err.invalidCommand' };
  const cost = s.loans[index]!.remaining;
  if (s.money < cost) return { ok: false, reason: 'err.notEnoughMoney' };
  s.money = moneyRound(s.money - cost);
  s.stats.money = s.money;
  s.loans.splice(index, 1);
  return { ok: true, cost };
}
