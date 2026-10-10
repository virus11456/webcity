import { MAP_PRESETS } from './data/terrain';
import type { CitySettings } from './world/snapshot';
import { getSave } from './save/storage';
import { t } from './ui/i18n/t';
export const startup: {
  settings: CitySettings;
  data?: ArrayBuffer;
  construction: boolean;
} = {
  settings: {
    seed: MAP_PRESETS[0].seed,
    mapId: MAP_PRESETS[0].id,
    mode: 'normal',
    cityName: t('city.name'),
  },
  construction: false,
};
/** Read only an explicitly selected save; ordinary reloads never overwrite stored cities. */
export async function prepareStartup(): Promise<void> {
  const slot = sessionStorage.getItem('webcity-load');
  if (slot !== null) {
    sessionStorage.removeItem('webcity-load');
    const saved = await getSave(slot);
    startup.settings = saved.metadata.settings;
    startup.data = saved.data;
    startup.construction = true;
  }
}
