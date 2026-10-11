import { uniqueDefinition } from '../world/unique';
import type { FailureReason } from '../bridge/protocol';
import { BUILDINGS, NETWORKS } from '../data/buildings';
import { ROADS, type RoadTypeId } from '../data/roads';
import { GROWTH, ZONES } from '../data/zones';
import { t } from './i18n/t';

type Category = 'road' | 'zone' | 'power' | 'water' | 'service' | 'park';
const money = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
export { createIcon as catalogIcon } from './icons';
import { createIcon } from './icons';
import { ITEM_ICONS } from '../data/icons';
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
    lock.append(createIcon('lock'), ` MS${unlock} · ${t('road.locked')}`);
    button.append(
      createIcon(
        ITEM_ICONS[id] ?? (facility?.kind === 'park' ? 'park' : category),
      ),
      name,
      price,
      maintenance,
      lock,
    );
    const unique = uniqueDefinition(id);
    if (unique) {
      const effect = document.createElement('small');
      effect.textContent = `${t('unique.effect')} +${unique.landValueBonus} · ${unique.radiusM} m`;
      const requirement = document.createElement('small');
      requirement.textContent = `MS${unique.unlock} · ${t('unique.requires')} ${t(unique.requires === 'water_treatment' ? 'water.water_treatment' : `service.${unique.requires}`)}`;
      button.append(effect, requirement);
    }
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
    update(
      unlocked?: readonly number[],
      reasons: Record<string, FailureReason | undefined> = {},
    ) {
      for (const { option, button, lock, unlock } of entries) {
        if (unlocked) option.disabled = !unlocked.includes(unlock);
        if (reasons[option.value]) option.disabled = true;
        lock.textContent = reasons[option.value]
          ? t(reasons[option.value]!)
          : `MS${unlock} · ${t('road.locked')}`;
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
