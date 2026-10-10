import { it, expect } from 'vitest';
import { BUILDINGS, NETWORKS } from '../../src/data/buildings';
import { ROADS } from '../../src/data/roads';
import { ZONES } from '../../src/data/zones';
import { INFO_VIEWS } from '../../src/data/infoViews';
import { PROBLEMS } from '../../src/data/simulation';
import {
  ICON_PATHS,
  ITEM_ICONS,
  INFO_ICONS,
  PROBLEM_ICONS,
} from '../../src/data/icons';
import { iconForKey } from '../../src/ui/icons';
it('covers every current building, network, road, zone, info view and problem with original SVG artwork', () => {
  for (const id of [
    ...BUILDINGS.map((b) => b.id),
    ...NETWORKS.map((b) => b.id),
    ...Object.keys(ROADS),
    ...Object.keys(ZONES),
  ])
    expect(ICON_PATHS[ITEM_ICONS[id]!], id).toBeTruthy();
  for (const id of INFO_VIEWS)
    expect(ICON_PATHS[INFO_ICONS[id]!], id).toBeTruthy();
  for (const id of Object.keys(PROBLEMS))
    expect(ICON_PATHS[PROBLEM_ICONS[id]!], id).toBeTruthy();
});
it('uses semantic artwork for tools and keeps service icons distinct', () => {
  expect(iconForKey('bulldoze.tab')).toBe('bulldoze');
  expect(iconForKey('road.confirm')).toBe('check');
  expect(iconForKey('info.traffic')).toBe('car');
  expect(iconForKey('service.crematorium')).toBe('crematorium');
  expect(iconForKey('service.police_station')).toBe('shield');
});
