import {
  INDUSTRY_SPECIALIZATIONS,
  type IndustrySpecializationId,
} from '../data/policies';
import { DISTRICTS as D } from '../data/districts';
import type { DistrictTool, DistrictToolState } from '../tools/districtTool';
import { t } from './i18n/t';
export function createDistrictControls(
  parent: HTMLElement,
  tool: DistrictTool,
) {
  const host = document.createElement('section');
  host.className = 'district-controls';
  const row = document.createElement('div');
  row.className = 'road-row';
  const button = (key: Parameters<typeof t>[0], run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(key);
    b.onclick = run;
    return b;
  };
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('district.select'));
  select.onchange = () => tool.select(Number(select.value));
  const create = button(
    'district.create',
    () =>
      void tool.command({
        action: 'create',
        name: `${t('district.default')} ${tool.readState().districts.length + 1}`,
      }),
  );
  row.append(select, create);
  const nameRow = document.createElement('div');
  nameRow.className = 'road-row';
  const name = document.createElement('input');
  name.maxLength = D.maxName;
  name.setAttribute('aria-label', t('district.name'));
  const rename = button('district.rename', () => {
    const id = tool.readState().selected;
    if (id !== null)
      void tool.command({ action: 'rename', id, name: name.value });
  });
  const remove = button('district.delete', () => {
    const id = tool.readState().selected;
    if (id !== null) void tool.command({ action: 'delete', id });
  });
  nameRow.append(name, rename, remove);
  const brushes = document.createElement('div');
  brushes.className = 'road-row';
  const small = button('district.small', () =>
      tool.brush(D.smallRadiusM, false),
    ),
    large = button('district.large', () => tool.brush(D.largeRadiusM, false)),
    erase = button('district.erase', () =>
      tool.brush(tool.readState().radius, true),
    );
  brushes.append(small, large, erase);
  const specialization = document.createElement('select');
  specialization.setAttribute('aria-label', t('industry.select'));
  for (const id of [
    'general',
    ...INDUSTRY_SPECIALIZATIONS.map((d) => d.id),
  ] as const) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = t(`industry.${id}`);
    specialization.append(o);
  }
  specialization.onchange = () => {
    const id = tool.readState().selected;
    if (id !== null)
      void tool.command({
        action: 'specialize',
        id,
        industry:
          specialization.value === 'general'
            ? null
            : (specialization.value as IndustrySpecializationId),
      });
  };
  const industryHint = document.createElement('p');
  industryHint.className = 'power-hint';
  industryHint.textContent = t('industry.hint');
  const hint = document.createElement('p');
  hint.className = 'power-hint';
  hint.textContent = t('district.hint');
  const stats = document.createElement('p');
  stats.className = 'district-stats';
  const status = document.createElement('output');
  status.setAttribute('role', 'status');
  host.append(
    row,
    nameRow,
    brushes,
    specialization,
    industryHint,
    hint,
    stats,
    status,
  );
  parent.append(host);
  let signature = '',
    selected: number | null = null;
  return {
    update(s: DistrictToolState) {
      host.dataset.pending = String(s.pending);
      host.dataset.count = String(s.districts.length);
      host.dataset.selected = String(s.selected ?? '');
      const key = JSON.stringify(s.districts.map((d) => [d.id, d.name]));
      if (key !== signature) {
        signature = key;
        select.replaceChildren(
          ...s.districts.map((d) => {
            const o = document.createElement('option');
            o.value = String(d.id);
            o.textContent = d.name;
            return o;
          }),
        );
      }
      select.value = String(s.selected ?? '');
      const d = s.districts.find((d) => d.id === s.selected);
      if (selected !== s.selected || document.activeElement !== name)
        name.value = d?.name ?? '';
      selected = s.selected;
      specialization.value = d?.industry ?? 'general';
      for (const b of [
        select,
        name,
        rename,
        remove,
        small,
        large,
        erase,
        specialization,
      ])
        b.disabled = s.pending || !d;
      create.disabled = s.pending || s.districts.length >= D.maxCount;
      small.setAttribute(
        'aria-pressed',
        String(!s.erase && s.radius === D.smallRadiusM),
      );
      large.setAttribute(
        'aria-pressed',
        String(!s.erase && s.radius === D.largeRadiusM),
      );
      erase.setAttribute('aria-pressed', String(s.erase));
      stats.textContent = d
        ? `${t('district.population')} ${d.population} · ${t('district.households')} ${d.households} · ${t('district.jobs')} ${d.workers}/${d.jobs} · ${t('district.buildings')} ${d.buildings} · ${t('district.area')} ${(d.area / 1e6).toFixed(3)} km²`
        : t('district.empty');
      status.textContent = s.reason ? t(s.reason) : '';
    },
    dispose() {
      host.remove();
    },
  };
}
