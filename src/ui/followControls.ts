import { t } from './i18n/t';
import './styles/follow.css';
/** Capture input before tools/UI handlers; starting via the follow button happens afterwards. */
export function createFollowControls(parent: HTMLElement, cancel: () => void) {
  const button = document.createElement('button');
  button.className = 'follow-status';
  button.hidden = true;
  button.setAttribute('aria-label', t('follow.stop'));
  button.onclick = cancel;
  parent.append(button);
  const stop = (event: Event) => {
    if (event.type === 'blur' && event.target !== window) return;
    // Keep this button mounted through pointerup so cancellation cannot click the toolbar underneath.
    if (event.type === 'pointerdown' && event.target === button) return;
    cancel();
  };
  for (const type of ['pointerdown', 'wheel', 'keydown', 'resize', 'blur'])
    window.addEventListener(type, stop, { capture: true, passive: true });
  return {
    update(id: number | null) {
      button.hidden = id === null;
      parent.dataset.following = id === null ? 'none' : String(id);
      button.textContent =
        id === null
          ? ''
          : `${t('follow.active')} #${id} · ${t('follow.cancelHint')}`;
    },
    dispose() {
      for (const type of ['pointerdown', 'wheel', 'keydown', 'resize', 'blur'])
        window.removeEventListener(type, stop, true);
      button.remove();
      delete parent.dataset.following;
    },
  };
}
