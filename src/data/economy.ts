import type { MilestoneId } from './milestones';
// GDD §13. Tax/interest rates are fractions; UI percentages convert at the boundary.
export interface LoanDefinition {
  readonly id: string;
  readonly amount: number;
  readonly annualInterest: number;
  readonly termWeeks: number;
  readonly unlock: MilestoneId;
}
export const LOANS = [
  {
    id: 'loan_small',
    amount: 20000,
    annualInterest: 0.02,
    termWeeks: 52,
    unlock: 0,
  },
  {
    id: 'loan_regular',
    amount: 50000,
    annualInterest: 0.04,
    termWeeks: 104,
    unlock: 0,
  },
  {
    id: 'loan_large',
    amount: 100000,
    annualInterest: 0.06,
    termWeeks: 156,
    unlock: 4,
  },
] as const satisfies readonly LoanDefinition[];
export type LoanId = (typeof LOANS)[number]['id'];
export const ECONOMY = {
  startingMoney: {
    normal: 70000,
    easy: 200000,
  },
  maxLoans: 3,
  incomePerWeek: {
    household: 16,
    commercialJob: 20,
    industrialJob: 18,
    officeJob: 28,
  },
  farePerPassenger: 2,
  levelMultipliers: [1, 1.3, 1.6, 1.9, 2.2],
  taxRate: {
    min: 0.01,
    max: 0.29,
    default: 0.09,
  },
  budget: {
    min: 0.5,
    max: 1.5,
  },
  bankruptcy: {
    balanceThreshold: -10000,
    warningWeeks: 4,
    additionalWeeksToGameOver: 4,
  },
  balanceTargets: {
    profitableByWeek: 4,
    weeklyNetIncome: [
      {
        population: 1000,
        min: 500,
        max: 1500,
      },
      {
        population: 10000,
        min: 5000,
        max: 12000,
      },
    ],
  },
} as const;
export const BUDGET_DEPARTMENTS = [
  'power',
  'water',
  'garbage',
  'health',
  'fire',
  'police',
  'education',
  'deathcare',
  'parks',
  'roads',
  'transit',
] as const;
export type BudgetDepartment = (typeof BUDGET_DEPARTMENTS)[number];
export type EconomyConfig = typeof ECONOMY;
