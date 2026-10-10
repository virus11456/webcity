import { render } from 'preact';
import type { SimClient } from '../../bridge/simClient';
import type { SimSpeed } from '../../data/config';
import { Settings } from './MainMenu';
import { Button } from '../components/Button';
import { t } from '../i18n/t';
import type { Preferences } from '../preferences';

/** Pause the Worker before opening; explicit resume restores its acknowledged prior speed. */
export function createPauseMenu(
  parent: HTMLElement,
  client: SimClient,
  apply: (preferences: Preferences) => void,
  saveBeforeExit: () => Promise<void>,
) {
  const trigger = document.createElement('button');
  trigger.textContent = t('menu.pause');
  trigger.type = 'button';
  trigger.className = 'menu-trigger';
  const dialog = document.createElement('dialog');
  dialog.className = 'pause-dialog';
  dialog.setAttribute('aria-label', t('menu.pause'));
  parent.append(dialog);
  (parent.querySelector('.road-tabs') ?? parent).append(trigger);
  let previous: SimSpeed = 0,
    busy = false;
  async function resume() {
    if (busy) return;
    busy = true;
    try {
      const result = await client.send({ t: 'setSpeed', speed: previous });
      if (result.t !== 'result' || !result.ok) throw new Error('resume');
      dialog.close();
    } catch {
      const message = dialog.querySelector('[role="alert"]');
      if (message) message.textContent = t('menu.actionFailed');
    } finally {
      busy = false;
    }
  }
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    void resume();
  });
  trigger.onclick = async () => {
    if (busy || !client.mirror.clock) return;
    busy = true;
    previous = client.mirror.clock.speed;
    try {
      const result = await client.send({ t: 'setSpeed', speed: 0 });
      if (result.t !== 'result' || !result.ok) return;
      render(
        <>
          <h1>{t('menu.pause')}</h1>
          <Button variant="primary" onClick={() => void resume()}>
            {t('menu.resume')}
          </Button>
          <details>
            <summary>{t('menu.settings')}</summary>
            <Settings apply={apply} />
          </details>
          <Button
            onClick={() => {
              if (busy) return;
              busy = true;
              void saveBeforeExit()
                .then(() => {
                  const url = new URL(location.href);
                  url.searchParams.delete('play');
                  location.assign(url);
                })
                .catch(() => {
                  busy = false;
                  const message = dialog.querySelector('[role="alert"]');
                  if (message) message.textContent = t('save.failed');
                });
            }}
          >
            {t('menu.saveExit')}
          </Button>
          <p role="alert" />
        </>,
        dialog,
      );
      dialog.showModal();
    } catch {
      trigger.title = t('menu.actionFailed');
    } finally {
      busy = false;
    }
  };
  return {
    dispose() {
      render(null, dialog);
      dialog.remove();
      trigger.remove();
    },
  };
}
