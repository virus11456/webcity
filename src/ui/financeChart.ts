import { FINANCE_CHART as C } from '../data/charts';
import { UI_PALETTE as P } from '../data/palette';
import {
  financeDomain,
  type FinanceMetric,
  type FinancePoint,
} from '../world/financeHistory';
import type { SimClient } from '../bridge/simClient';
import { t } from './i18n/t';
import './styles/financeChart.css';
const colors = { income: P.positive, expenses: P.negative, money: P.accent };
const labels = {
  income: 'chart.income',
  expenses: 'chart.expenses',
  money: 'chart.money',
} as const;
const format = (n: number) =>
  `$${n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
/** Canvas-drawn bitmap keeps the game canvas the only interactive canvas in the page. */
export function createFinanceChart(
  dialog: HTMLDialogElement,
  client: SimClient,
) {
  const host = document.createElement('details'),
    title = document.createElement('summary');
  host.className = 'finance-history';
  title.textContent = t('chart.title');
  host.append(title);
  const hint = document.createElement('p');
  hint.textContent = t('chart.hint');
  host.append(hint);
  const filters = document.createElement('div');
  filters.className = 'chart-filters';
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', t('chart.metric'));
  let metric: FinanceMetric = 'income',
    points: FinancePoint[] = [],
    selected = 0,
    selectedWeek: number | undefined,
    signature = '';
  const buttons = (['income', 'expenses', 'money'] as const).map((key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(labels[key]);
    b.onclick = () => {
      metric = key;
      draw();
    };
    filters.append(b);
    return { b, key };
  });
  const picture = document.createElement('img');
  picture.className = 'finance-chart';
  picture.draggable = false;
  const empty = document.createElement('p');
  empty.textContent = t('chart.empty');
  empty.className = 'chart-empty';
  const scrub = document.createElement('label'),
    scrubText = document.createElement('span'),
    range = document.createElement('input'),
    readout = document.createElement('p');
  scrub.className = 'chart-scrub';
  scrubText.textContent = t('chart.selectWeek');
  range.type = 'range';
  range.min = '0';
  range.step = '1';
  range.setAttribute('aria-label', t('chart.selectWeek'));
  range.oninput = () => {
    selected = Number(range.value);
    selectedWeek = points[selected]?.week;
    draw();
  };
  scrub.append(scrubText, range);
  readout.className = 'chart-readout';
  readout.setAttribute('aria-live', 'polite');
  host.append(filters, empty, picture, scrub, readout);
  dialog.append(host);
  const canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d')!;
  function draw() {
    if (!dialog.open || !host.open) return;
    for (const { b, key } of buttons)
      b.setAttribute('aria-pressed', String(metric === key));
    host.dataset.metric = metric;
    host.dataset.points = String(points.length);
    host.dataset.firstWeek = String(points[0]?.week ?? 0);
    host.dataset.lastWeek = String(points.at(-1)?.week ?? 0);
    empty.hidden = !!points.length;
    picture.hidden = scrub.hidden = readout.hidden = !points.length;
    if (!points.length) return;
    selected = Math.max(0, Math.min(selected, points.length - 1));
    const point = points[selected]!;
    range.max = String(points.length - 1);
    range.value = String(selected);
    range.disabled = points.length < 2;
    range.setAttribute('aria-valuetext', `${t('chart.week')} ${point.week}`);
    readout.textContent = `${t('chart.week')} ${point.week} · ${t('chart.income')} ${format(point.income)} · ${t('chart.expenses')} ${format(point.expenses)} · ${t('chart.money')} ${format(point.money)}`;
    const width = Math.max(C.minWidth, Math.floor(host.clientWidth)),
      height = C.height,
      dpr = Math.min(devicePixelRatio || 1, C.maxDpr);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${C.fontPx}px system-ui`;
    ctx.textBaseline = 'middle';
    const [min, max] = financeDomain(points, metric),
      plotW = width - C.left - C.right,
      plotH = height - C.top - C.bottom;
    const first = points[0]!.week,
      last = points.at(-1)!.week;
    const x = (week: number) =>
      C.left +
      (last === first ? plotW / 2 : ((week - first) / (last - first)) * plotW);
    const y = (value: number) => C.top + ((max - value) / (max - min)) * plotH;
    const compact = new Intl.NumberFormat('zh-TW', {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    ctx.textAlign = 'right';
    for (let i = 0; i <= C.gridSteps; i++) {
      const value = min + ((max - min) * i) / C.gridSteps,
        py = y(value);
      ctx.strokeStyle = P.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(C.left, py);
      ctx.lineTo(width - C.right, py);
      ctx.stroke();
      ctx.fillStyle = P.secondaryText;
      ctx.fillText(`$${compact.format(value)}`, C.left - 8, py);
    }
    if (min < 0) {
      ctx.strokeStyle = P.secondaryText;
      ctx.beginPath();
      ctx.moveTo(C.left, y(0));
      ctx.lineTo(width - C.right, y(0));
      ctx.stroke();
    }
    ctx.fillStyle = P.secondaryText;
    ctx.textAlign = 'left';
    ctx.fillText(`${t('chart.week')} ${first}`, C.left, height - C.bottom / 2);
    if (first !== last) {
      ctx.textAlign = 'right';
      ctx.fillText(
        `${t('chart.week')} ${last}`,
        width - C.right,
        height - C.bottom / 2,
      );
    }
    ctx.strokeStyle = colors[metric];
    ctx.lineWidth = C.lineWidth;
    ctx.beginPath();
    points.forEach((p, i) => {
      const prior = points[i - 1];
      if (!prior || p.week !== prior.week + 1)
        ctx.moveTo(x(p.week), y(p[metric]));
      else ctx.lineTo(x(p.week), y(p[metric]));
    });
    ctx.stroke();
    ctx.fillStyle = colors[metric];
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(x(p.week), y(p[metric]), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = P.secondaryText;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x(point.week), C.top);
    ctx.lineTo(x(point.week), height - C.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors[metric];
    ctx.beginPath();
    ctx.arc(x(point.week), y(point[metric]), C.markerRadius, 0, Math.PI * 2);
    ctx.fill();
    picture.alt = `${t(labels[metric])} · ${t('chart.week')} ${first}–${last}`;
    picture.src = canvas.toDataURL('image/png');
  }
  function update(force = false) {
    if (!dialog.open || !host.open) return;
    const next = client.mirror.readFinanceHistory(),
      key = JSON.stringify(next);
    if (!force && key === signature) return;
    const wasLatest = selected === points.length - 1;
    signature = key;
    points = next;
    const retained =
      selectedWeek === undefined
        ? -1
        : points.findIndex((p) => p.week === selectedWeek);
    selected =
      wasLatest || retained < 0 ? Math.max(0, points.length - 1) : retained;
    selectedWeek = points[selected]?.week;
    draw();
  }
  host.ontoggle = () => update(true);
  const observer = new ResizeObserver(() => draw());
  observer.observe(host);
  return {
    update,
    dispose() {
      observer.disconnect();
      host.remove();
    },
  };
}
