import type { SimClient } from '../bridge/simClient';
import { SAVE } from '../data/persistence';
import { listSaves, putSave, getSave } from './storage';
/** Persist worker snapshots and serialize writes; background failures leave existing slots intact. */
export function createSaveController(
  client: SimClient,
  thumbnail: () => string | null,
  notify: (failed: boolean) => void,
) {
  let saving = false,
    disposed = false;
  async function save(id: string) {
    if (saving || disposed) throw new Error('Save already in progress');
    saving = true;
    try {
      let image: string | null = null;
      try {
        image = thumbnail();
      } catch {
        /* Saving the city must not depend on WebGL availability. */
      }
      const response = await client.send({ t: 'save' });
      if (response.t !== 'saved') throw new Error('Save failed');
      await putSave(
        {
          id,
          settings: { ...response.metadata.settings },
          population: response.metadata.population,
          day: response.metadata.day,
          savedAt: Date.now(),
          thumbnail: image,
        },
        response.data,
      );
      notify(false);
    } catch (error) {
      notify(true);
      throw error;
    } finally {
      saving = false;
    }
  }
  const autosave = () => {
    if (!saving && client.mirror.clock && !disposed)
      void save(SAVE.autoId).catch(() => {});
  };
  const hidden = () => {
    if (document.visibilityState === 'hidden') autosave();
  };
  const timer = setInterval(autosave, SAVE.intervalMs);
  document.addEventListener('visibilitychange', hidden);
  return {
    list: listSaves,
    save,
    async load(id: string) {
      await getSave(id);
      sessionStorage.setItem('webcity-load', id);
      location.reload();
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
    },
  };
}
