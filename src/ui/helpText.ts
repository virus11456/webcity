import { t } from './i18n/t';
import { MILESTONES } from '../data/milestones';

export function unlockHint(unlock: number): string {
  const milestone = MILESTONES.find((m) => m.id === unlock);
  return milestone
    ? t('toolbar.unlockAt').replace(
        '{population}',
        milestone.population.toLocaleString('zh-TW'),
      )
    : t('road.locked');
}
type Key = Parameters<typeof t>[0];
/** Existing native controls retain their labels; descriptions explain the action. */
const groups: [Key[], Key][] = [
  [['road.enter', 'road.draw'], 'help.roads'],
  [['zone.tab'], 'help.zones'],
  [['power.tab'], 'help.power'],
  [['water.tab'], 'help.water'],
  [['service.tab'], 'help.services'],
  [['district.tab'], 'help.districts'],
  [['policy.title'], 'help.policies'],
  [['terraform.tab'], 'help.terraform'],
  [['unique.tab'], 'help.unique'],
  [['bus.tab'], 'help.bus'],
  [['metro.tab'], 'help.metro'],
  [['tram.tab'], 'help.tram'],
  [['bulldoze.tab'], 'help.bulldoze'],
  [['road.explore'], 'help.explore'],
  [['finance.title'], 'help.finance'],
  [['save.title'], 'help.save'],
  [['save.write'], 'help.saveSlot'],
  [['save.overwrite'], 'help.overwrite'],
  [['save.load'], 'help.load'],
  [['info.title'], 'help.info'],
  [['tiles.title'], 'help.tiles'],
  [['menu.pause'], 'help.menu'],
  [['road.confirm'], 'road.confirmHint'],
  [['undo.title'], 'undo.hint'],
  [['sim.pause'], 'help.pause'],
  [['sim.speed1', 'sim.speed2', 'sim.speed4'], 'help.speed'],
];
const descriptions = new Map(
  groups.flatMap(([labels, help]) =>
    labels.map((label) => [t(label), t(help)] as const),
  ),
);
export function helpText(
  target: HTMLElement,
  nativeTitle = target.title,
): string | undefined {
  const explicit = target.dataset.tooltip;
  if (explicit) return explicit;
  if (target.tagName !== 'BUTTON') return undefined;
  const label =
    target.getAttribute('aria-label') ?? target.textContent?.trim() ?? '';
  // Icon buttons repeat their accessible name in title; that is not help text.
  const detail = nativeTitle?.trim() === label ? undefined : nativeTitle;
  const text = descriptions.get(label);
  const prefix = text;
  return prefix
    ? [...new Set([prefix, detail].filter(Boolean))].join('\n')
    : detail || undefined;
}
