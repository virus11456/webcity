import { INFO_VIEWS, type InfoView } from '../data/infoViews';
import { UI_PALETTE } from '../data/palette';
import { t } from './i18n/t';
import './styles/info.css';
export function createInfoControls(
  parent: HTMLElement,
  onChange: (view: InfoView | null) => void,
) {
  const trigger = document.createElement('button'),
    panel = document.createElement('aside'),
    heading = document.createElement('strong'),
    close = document.createElement('button'),
    select = document.createElement('select'),
    scale = document.createElement('div'),
    legend = document.createElement('p'),
    hint = document.createElement('p');
  trigger.textContent = t('info.title');
  trigger.className = 'info-trigger';
  trigger.setAttribute('aria-expanded', 'false');
  panel.className = 'info-panel';
  panel.setAttribute('aria-label', t('info.title'));
  panel.hidden = true;
  heading.textContent = t('info.title');
  close.textContent = t('info.close');
  close.setAttribute('aria-label', t('info.close'));
  select.setAttribute('aria-label', t('info.select'));
  select.className = 'info-select';
  for (const id of INFO_VIEWS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = t(`info.${id}`);
    select.append(option);
  }
  scale.className = 'info-scale';
  scale.style.background = `linear-gradient(to right,${UI_PALETTE.infoScale.join(',')})`;
  scale.setAttribute('aria-hidden', 'true');
  legend.className = 'info-legend';
  hint.className = 'info-hint';
  panel.append(heading, close, select, scale, legend, hint);
  parent.append(panel);
  (parent.querySelector('.road-tabs') ?? parent).append(trigger);
  let active: InfoView | null = null;
  const position = () => {
    const bottom =
      parent.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 120;
    panel.style.top = `${bottom + 10}px`;
  };
  const observer = new ResizeObserver(position);
  const topbar = parent.querySelector('.topbar');
  if (topbar) observer.observe(topbar);
  window.addEventListener('resize', position);
  const set = (view: InfoView | null) => {
    active = view;
    panel.hidden = view === null;
    trigger.setAttribute('aria-expanded', String(view !== null));
    parent.dataset.info = view ?? 'none';
    panel.dataset.view = view ?? 'none';
    if (view) {
      select.value = view;
      legend.textContent = t(`info.legend.${view}`);
      hint.textContent = t(
        [
          'power',
          'water',
          'sewage',
          'crime',
          'health',
          'education',
          'happiness',
          'fireRisk',
          'population',
        ].includes(view)
          ? 'info.sampled'
          : 'info.continuous',
      );
      position();
    }
    onChange(view);
  };
  trigger.onclick = () => set(active ? null : 'landValue');
  close.onclick = () => {
    set(null);
    trigger.focus();
  };
  select.onchange = () => set(select.value as InfoView);
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && active) {
      set(null);
      trigger.focus();
    }
  };
  window.addEventListener('keydown', key);
  return {
    set,
    dispose() {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('keydown', key);
      trigger.remove();
      panel.remove();
      delete parent.dataset.info;
    },
  };
}
