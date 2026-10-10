import { t } from '../ui/i18n/t';

/** Request durable storage where supported; refusal must not prevent play. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Register the production worker and offer updates without automatic reloads. */
export async function registerPwa(): Promise<void> {
  void requestPersistentStorage();
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL, updateViaCache: 'none' },
    );
    let acceptedUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (acceptedUpdate) window.location.reload();
    });

    const offerUpdate = () => {
      if (
        !registration.waiting ||
        !navigator.serviceWorker.controller ||
        document.querySelector('#pwa-update')
      )
        return;
      const toast = document.createElement('aside');
      toast.id = 'pwa-update';
      toast.className = 'pwa-toast';
      toast.setAttribute('aria-label', t('pwa.update'));
      toast.setAttribute('aria-live', 'polite');
      const update = document.createElement('button');
      update.type = 'button';
      update.textContent = t('pwa.update');
      update.addEventListener('click', () => {
        const waiting = registration.waiting;
        if (!waiting) {
          toast.remove();
          return;
        }
        acceptedUpdate = true;
        update.disabled = true;
        update.textContent = t('pwa.updating');
        waiting.postMessage({ type: 'SKIP_WAITING' });
      });
      const later = document.createElement('button');
      later.type = 'button';
      later.textContent = t('pwa.later');
      later.addEventListener('click', () => toast.remove());
      toast.append(update, later);
      document.body.append(toast);
    };

    const watchInstalling = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') offerUpdate();
      });
    };
    registration.addEventListener('updatefound', watchInstalling);
    watchInstalling();
    offerUpdate();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible')
        void registration.update().catch(() => undefined);
    });
  } catch (error) {
    // Offline first visits / restricted storage must not break the game shell.
    console.warn('PWA registration unavailable', error);
  }
}
