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
  const transfers = document.createElement('div');
  transfers.className = 'save-actions save-transfers';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = t('save.export');
  const download = document.createElement('a');
  download.textContent = t('save.download');
  download.hidden = true;
  const share = document.createElement('button');
  share.type = 'button';
  share.textContent = t('save.share');
  share.hidden = true;
  const hint = document.createElement('p');
  hint.className = 'save-hint';
  hint.textContent = t('save.importHint');
  transfers.append(exportButton, download, share);
  const list = document.createElement('div');
  list.className = 'save-list';
  dialog.append(title, close, transfers, hint, message, list);
  parent.append(dialog);
  (parent.querySelector('.road-tabs') ?? parent).append(trigger);
  let disposed = false,
    busy = false,
    armed: string | null = null;
  let prepared: File | null = null;
  let downloadUrl: string | null = null;
  let pendingImport: { id: string; file: File } | null = null;
  function clearExport() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    prepared = null;
    download.removeAttribute('href');
    download.hidden = share.hidden = true;
  }
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    pendingImport = null;
    armed = null;
    clearExport();
  });
  exportButton.onclick = () =>
    void run(
      async () => {
        clearExport();
        const file = await actions.exportFile();
        if (disposed) return;
        prepared = file;
        downloadUrl = URL.createObjectURL(file);
        download.href = downloadUrl;
        download.download = file.name;
        download.hidden = false;
        share.hidden = !(navigator.canShare?.({ files: [file] }) ?? false);
      },
      'save.exportReady',
      'save.exportFailed',
    );
  share.onclick = () => {
    if (!prepared) return;
    // Keep the native share invocation inside this user gesture (especially iOS).
    void navigator.share({ files: [prepared] }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        message.textContent = t('save.exportFailed');
    });
  };
  let entries: SaveMetadata[] = [];
  function paint() {
    if (disposed) return;
    close.disabled = exportButton.disabled = busy;
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
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.wcity,application/octet-stream';
        picker.hidden = true;
        picker.setAttribute('aria-label', t('save.import'));
        picker.onchange = () => {
          const file = picker.files?.[0];
          if (!file || disposed || busy) return;
          armed = null;
          pendingImport = { id, file };
          paint();
        };
        const importButton = document.createElement('button');
        importButton.type = 'button';
        importButton.disabled = busy;
        importButton.textContent = t('save.import');
        importButton.onclick = () => picker.click();
        buttons.append(importButton, picker);
        if (pendingImport?.id === id) {
          const selection = document.createElement('p');
          selection.className = 'save-import-selection';
          selection.textContent =
            t('save.importSelected') + pendingImport.file.name;
          row.append(selection);
          const confirm = document.createElement('button');
          confirm.type = 'button';
          confirm.textContent = t(
            entry ? 'save.importReplace' : 'save.importConfirm',
          );
          confirm.disabled = busy;
          confirm.onclick = () => {
            const file = pendingImport?.file;
            if (file)
              void run(
                () => actions.importFile(id, file),
                'save.imported',
                'save.importFailed',
              );
          };
          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.textContent = t('save.importCancel');
          cancel.disabled = busy;
          cancel.onclick = () => {
            pendingImport = null;
            paint();
          };
          buttons.append(confirm, cancel);
        }
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
  async function run(
    action: () => Promise<void>,
    success: Parameters<typeof t>[0] = 'save.saved',
    failure: Parameters<typeof t>[0] = 'save.failed',
  ) {
    if (busy) return;
    busy = true;
    armed = null;
    pendingImport = null;
    message.textContent = t('save.busy');
    paint();
    try {
      await action();
      entries = await actions.list();
      message.textContent = t(success);
    } catch {
      message.textContent = t(failure);
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
      pendingImport = null;
      clearExport();
      trigger.remove();
      dialog.remove();
    },
  };
}
