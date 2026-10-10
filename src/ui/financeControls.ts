import { BUDGET_DEPARTMENTS, ECONOMY, LOANS } from '../data/economy';
import { ZONES, type ZoneType } from '../data/zones';
import type { SimClient } from '../bridge/simClient';
import type { CommandInput } from '../bridge/protocol';
import { t } from './i18n/t';

/** Prototype controls for the economy system; the shared budget panel follows in M1-23. */
export function createFinanceControls(parent: HTMLElement, client: SimClient) {
  const trigger = document.createElement('button');
  trigger.className = 'finance-trigger';
  trigger.textContent = t('finance.title');
  const dialog = document.createElement('dialog');
  dialog.className = 'finance-dialog';
  dialog.setAttribute('aria-label', t('finance.title'));
  const heading = document.createElement('h1');
  heading.textContent = t('finance.title');
  const close = document.createElement('button');
  close.textContent = t('finance.close');
  close.onclick = () => dialog.close();
  const balance = document.createElement('p'),
    summary = document.createElement('p');
  balance.className = 'finance-balance';
  summary.className = 'finance-summary';
  const warning = document.createElement('p');
  warning.className = 'finance-warning';
  warning.setAttribute('role', 'alert');
  const restart = document.createElement('button');
  restart.textContent = t('finance.restart');
  restart.onclick = () => location.reload();
  const message = document.createElement('output');
  message.setAttribute('role', 'status');
  message.className = 'finance-message';
  dialog.append(heading, close, balance, summary, warning, restart, message);
  const tax = section('finance.tax', 'finance.taxHint'),
    budget = section('finance.budget', 'finance.budgetHint');
  const sliders: {
    input: HTMLInputElement;
    output: HTMLOutputElement;
    kind: 'tax' | 'budget';
    key: string;
  }[] = [];
  for (const z of Object.keys(ZONES) as ZoneType[])
    slider(
      tax,
      t(`zone.${z}`),
      'tax',
      z,
      ECONOMY.taxRate.min,
      ECONOMY.taxRate.max,
      (value) => ({ t: 'setTax', zone: z, rate: value }),
    );
  for (const dept of BUDGET_DEPARTMENTS)
    slider(
      budget,
      t(`finance.${dept}`),
      'budget',
      dept,
      ECONOMY.budget.min,
      ECONOMY.budget.max,
      (value) => ({ t: 'setBudget', dept, value }),
    );
  const loanSection = section('finance.loans');
  const borrow = LOANS.map((loan, bank) => {
    const b = document.createElement('button');
    b.textContent = `${t('finance.borrow')} · ${t(`finance.${loan.id}`)} $${loan.amount.toLocaleString()} · ${t('finance.interest')} ${loan.annualInterest * 100}% / ${loan.termWeeks}`;
    b.onclick = () => void send({ t: 'takeLoan', bank });
    loanSection.append(b);
    return b;
  });
  const loans = document.createElement('div');
  loans.className = 'finance-loans';
  loanSection.append(loans);
  parent.append(dialog);
  (parent.querySelector('.road-tabs') ?? parent).append(trigger);
  let pending = false,
    lastLoans = '',
    lastStatus = '';
  const format = (n: number) =>
    `$${n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  function section(
    key: Parameters<typeof t>[0],
    hint?: Parameters<typeof t>[0],
  ) {
    const d = document.createElement('details'),
      s = document.createElement('summary');
    s.textContent = t(key);
    d.append(s);
    if (hint) {
      const p = document.createElement('p');
      p.textContent = t(hint);
      d.append(p);
    }
    dialog.append(d);
    return d;
  }
  function slider(
    host: HTMLElement,
    label: string,
    kind: 'tax' | 'budget',
    key: string,
    min: number,
    max: number,
    command: (value: number) => CommandInput,
  ) {
    const row = document.createElement('label'),
      text = document.createElement('span'),
      input = document.createElement('input'),
      output = document.createElement('output');
    row.className = 'finance-slider';
    text.textContent = label;
    input.type = 'range';
    input.min = String(min * 100);
    input.max = String(max * 100);
    input.step = '1';
    input.setAttribute('aria-label', label);
    input.oninput = () => {
      output.textContent = `${input.value}%`;
    };
    input.onchange = () => void send(command(Number(input.value) / 100));
    row.append(text, output, input);
    host.append(row);
    sliders.push({ input, output, kind, key });
  }
  async function send(command: CommandInput) {
    if (pending) return;
    pending = true;
    update();
    try {
      const r = await client.send(command);
      message.textContent = t(
        r.t === 'result' && !r.ok
          ? (r.reason ?? 'err.invalidCommand')
          : 'finance.saved',
      );
    } catch {
      message.textContent = t('sim.failed');
    } finally {
      pending = false;
      update();
    }
  }
  function update() {
    const s = client.mirror.readFinance(),
      stats = client.mirror.readStats();
    if (!s || !stats) return;
    const ended = s.economy.status === 'gameOver';
    dialog.dataset.money = String(s.money);
    dialog.dataset.week = String(s.economy.settledWeek);
    dialog.dataset.status = s.economy.status;
    balance.dataset.negative = String(s.money < 0);
    balance.textContent = `${t('finance.balance')} ${format(s.money)}`;
    summary.textContent = `${t('finance.week')} ${format(stats.income - stats.expenses)} · ${t('finance.income')} ${format(stats.income)} · ${t('finance.expenses')} ${format(stats.expenses)}`;
    warning.hidden = s.economy.status === 'normal';
    warning.textContent = ended
      ? `${t('finance.gameOver')}。${t('finance.gameOverHint')}`
      : t('finance.warning');
    restart.hidden = !ended;
    for (const { input, output, kind, key } of sliders) {
      const values = kind === 'tax' ? s.taxRates : s.budgets;
      const value = values[key as keyof typeof values] as number;
      if (document.activeElement !== input || pending || ended) {
        input.value = String(Math.round(value * 100));
        output.textContent = `${input.value}%`;
      }
      input.disabled =
        pending ||
        ended ||
        (kind === 'budget' && !s.unlocked.includes(ECONOMY.budgetUnlock));
    }
    borrow.forEach((b, i) => {
      b.disabled =
        pending ||
        ended ||
        s.sandbox ||
        s.loans.length >= ECONOMY.maxLoans ||
        !s.unlocked.includes(LOANS[i]!.unlock);
    });
    const signature = JSON.stringify([s.loans, s.money, pending, ended]);
    if (signature !== lastLoans) {
      lastLoans = signature;
      loans.replaceChildren();
      if (!s.loans.length) loans.textContent = t('finance.empty');
      s.loans.forEach((loan, index) => {
        const row = document.createElement('p'),
          b = document.createElement('button');
        row.textContent = `${t(`finance.${LOANS[loan.bank]!.id}`)} · ${format(loan.remaining)} · ${t('finance.weeks')} ${loan.weeksLeft} `;
        b.textContent = t('finance.repay');
        b.disabled = pending || ended || s.money < loan.remaining;
        b.onclick = () => void send({ t: 'repayLoan', index });
        row.append(b);
        loans.append(row);
      });
    }
    if (
      s.economy.status !== lastStatus &&
      s.economy.status !== 'normal' &&
      !dialog.open
    )
      dialog.showModal();
    lastStatus = s.economy.status;
  }
  trigger.onclick = () => {
    update();
    dialog.showModal();
  };
  const off = client.onEvent((e) => {
    if (
      ['ready', 'stats', 'economy', 'fundsChanged', 'milestone'].includes(e.t)
    )
      update();
  });
  update();
  return {
    dispose() {
      off();
      dialog.remove();
      trigger.remove();
    },
  };
}
