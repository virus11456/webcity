import { TIME } from '../data/config';
import { FINANCE_CHART as C } from '../data/charts';
import type { CityStats } from './types';
export interface FinancePoint {
  week: number;
  income: number;
  expenses: number;
  money: number;
}
export type FinanceMetric = 'income' | 'expenses' | 'money';
/** Weekly settlement samples only: repeated daily income is not summed or guessed. */
export function financeHistory(
  history: readonly CityStats[],
  day: number,
): FinancePoint[] {
  const weeks = new Map<number, FinancePoint>();
  const earliest = Math.max(
    1,
    Math.floor(day / TIME.fiscalPeriodDays) - C.weeks + 1,
  );
  for (const s of history) {
    if (
      !s ||
      !Number.isSafeInteger(s.day) ||
      s.day <= 0 ||
      s.day > day ||
      s.day % TIME.fiscalPeriodDays ||
      ![s.income, s.expenses, s.money].every(Number.isFinite)
    )
      continue;
    const week = s.day / TIME.fiscalPeriodDays;
    if (week < earliest) continue;
    weeks.set(week, {
      week,
      income: s.income,
      expenses: s.expenses,
      money: s.money,
    });
  }
  return [...weeks.values()].sort((a, b) => a.week - b.week).slice(-C.weeks);
}
export function financeDomain(
  points: readonly FinancePoint[],
  metric: FinanceMetric,
): [number, number] {
  let min = 0,
    max = 0;
  for (const p of points) {
    min = Math.min(min, p[metric]);
    max = Math.max(max, p[metric]);
  }
  const padding = (max - min || 1) * C.domainPadding;
  return [min < 0 ? min - padding : 0, max + padding];
}
