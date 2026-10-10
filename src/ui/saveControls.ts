import { SAVE } from '../data/persistence';
import type { SaveActions, SaveMetadata } from '../world/saveTypes';
import { t } from './i18n/t';

/** Ten named manual slots plus a separate autosave, with explicit overwrite selection. */
export function createSaveControls(parent: HTMLElement, actions: SaveActions) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.textContent = t('save.title');
  const dialog = document.createElement('dialog');
  dialog.className = 'save-dialog';
  dialog.setAttribute('aria-label', t('save.title'));
  const title = document.createElement('h1');
  title.textContent = t('save.title');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = t('save.close');
  close.onclick = () => dialog.close();
  const message = document.createElement('p');
  message.className = 'save-status';
  message.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'save-list';
  dialog.append(title, close, message, list);
  parent.append(dialog);
  (parent.querySelector('.road-tabs') ?? parent).append(trigger);
  let disposed = false,
    busy = false,
    armed: string | null = null;
  let entries: SaveMetadata[] = [];
  function paint() {
    if (disposed) return;
    list.replaceChildren();
    for (const id of [
      SAVE.autoId,
      ...Array.from({ length: SAVE.slots }, (_, i) => String(i)),
    ]) {
      const entry = entries.find((s) => s.id === id),
        row = document.createElement('section');
      row.className = 'save-slot';
      row.dataset.slot = id;
      const heading = document.createElement('h2');
      heading.textContent =
        id === SAVE.autoId
          ? t('save.auto')
          : `${t('save.slot')} ${Number(id) + 1}`;
      row.append(heading);
      if (entry) {
        if (entry.thumbnail) {
          const img = document.createElement('img');
          img.src = entry.thumbnail;
          img.alt = entry.settings.cityName;
          img.width = SAVE.thumbnailWidth;
          img.height = SAVE.thumbnailHeight;
          row.append(img);
        }
        const info = document.createElement('p');
        info.textContent = `${entry.settings.cityName} · ${t('hud.population')} ${entry.population} · ${t('save.day')} ${entry.day + 1}\n${new Date(entry.savedAt).toLocaleString('zh-TW')}`;
        row.append(info);
      } else {
        const empty = document.createElement('p');
        empty.textContent = t('save.empty');
        row.append(empty);
      }
      const buttons = document.createElement('div');
      buttons.className = 'save-actions';
      if (id !== SAVE.autoId) {
        const save = document.createElement('button');
        save.type = 'button';
        save.disabled = busy;
        save.textContent = t(armed === id ? 'save.overwrite' : 'save.write');
        save.onclick = () => {
          if (entry && armed !== id) {
            armed = id;
            paint();
            return;
          }
          void run(() => actions.save(id));
        };
        buttons.append(save);
      }
      const load = document.createElement('button');
      load.type = 'button';
      load.textContent = t('save.load');
      load.disabled = !entry || busy;
      load.onclick = () => void run(() => actions.load(id));
      buttons.append(load);
      row.append(buttons);
      list.append(row);
    }
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    armed = null;
    message.textContent = t('save.busy');
    paint();
    try {
      await action();
      entries = await actions.list();
      message.textContent = t('save.saved');
    } catch {
      message.textContent = t('save.failed');
    } finally {
      busy = false;
      paint();
    }
  }
  trigger.onclick = () => {
    dialog.showModal();
    void run(async () => {
      entries = await actions.list();
    });
  };
  return {
    notify(failed: boolean) {
      message.textContent = t(failed ? 'save.failed' : 'save.autoSaved');
      if (!failed && dialog.open)
        void actions
          .list()
          .then((items) => {
            entries = items;
            paint();
          })
          .catch(() => {
            message.textContent = t('save.failed');
          });
    },
    dispose() {
      disposed = true;
      trigger.remove();
      dialog.remove();
    },
  };
}
