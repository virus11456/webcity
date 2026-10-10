import { BUILDINGS, NETWORKS } from '../data/buildings';
import { ROADS, type RoadTypeId } from '../data/roads';
import { GROWTH, ZONES } from '../data/zones';
import { t } from './i18n/t';

type Category = 'road' | 'zone' | 'power' | 'water' | 'service' | 'park';
const money = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
const paths: Record<Category, string> = {
  park: 'M12 22v-7M5 16h14L15 10h3L12 2 6 10h3z',
  service: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7M12 6v5m-2-3h4',
  road: 'M6 3 3 21M18 3l3 18M12 3v4m0 3v4m0 3v4',
  zone: 'm3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7',
  power: 'm13 2-9 12h7l-1 8 10-13h-7z',
  water: 'M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z',
};
/** Original line icons, shared by category buttons and build cards. */
export function catalogIcon(category: Category): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[category]);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  svg.append(path);
  return svg;
}
/** Cards delegate to the existing select command path, never writing simulation state. */
export function createBuildCatalog(
  select: HTMLSelectElement,
  category: Category,
) {
  const host = document.createElement('div');
  host.className = 'build-catalog';
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', t('toolbar.catalog'));
  const entries = Array.from(select.options, (option) => {
    const id = option.value;
    const road = category === 'road' ? ROADS[id as RoadTypeId] : undefined;
    const facility = BUILDINGS.find((b) => b.id === id);
    const network = NETWORKS.find(
      (n) =>
        n.id ===
        (id === 'line' ? 'power_line' : id === 'pipe' ? 'water_pipe' : id),
    );
    const zone =
      category === 'zone' && id in ZONES
        ? ZONES[id as keyof typeof ZONES]
        : undefined;
    const unlock =
      road?.unlock ?? facility?.unlock ?? network?.unlock ?? zone?.unlock ?? 0;
    const cost =
      road?.costPer8M ??
      facility?.cost ??
      network?.costPer8M ??
      GROWTH.zoningCost;
    const upkeep =
      road?.upkeepPer8MWeek ??
      facility?.upkeepPerWeek ??
      network?.upkeepPer8MWeek ??
      0;
    const perLength = !!(road || network);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'build-card';
    button.dataset.item = id;
    const name = document.createElement('strong');
    name.textContent = option.textContent?.split(' · ')[0] ?? '';
    const price = document.createElement('span');
    price.textContent = `${t('road.cost')} $${money.format(cost)}${perLength ? t('toolbar.per8m') : ''}`;
    const maintenance = document.createElement('small');
    maintenance.textContent = `${t('toolbar.upkeep')} $${money.format(upkeep)}${perLength ? t('toolbar.per8m') : ''}${t('toolbar.perWeek')}`;
    const lock = document.createElement('small');
    lock.className = 'build-lock';
    lock.textContent = `🔒 MS${unlock} · ${t('road.locked')}`;
    button.append(
      catalogIcon(facility?.kind === 'park' ? 'park' : category),
      name,
      price,
      maintenance,
      lock,
    );
    button.onclick = () => {
      if (select.disabled || option.disabled) return;
      select.value = id;
      select.dispatchEvent(new Event('change'));
      select
        .closest('#app')
        ?.querySelector('canvas')
        ?.focus({ preventScroll: true });
    };
    host.append(button);
    return { option, button, lock, unlock };
  });
  return {
    host,
    update(unlocked?: readonly number[]) {
      for (const { option, button, lock, unlock } of entries) {
        if (unlocked) option.disabled = !unlocked.includes(unlock);
        button.disabled = select.disabled || option.disabled;
        button.setAttribute(
          'aria-pressed',
          String(select.value === option.value),
        );
        lock.hidden = !option.disabled;
      }
    },
  };
}
