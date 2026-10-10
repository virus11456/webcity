import { cityAudio } from './manager';
/** Unlock only from user interaction; suspend immediately when the page is hidden. */
export function attachAudioControls(root: HTMLElement): () => void {
  const gesture = () => {
    void cityAudio.unlock();
  };
  const click = (event: Event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest('button,summary,select')
        : null;
    if (button && !button.matches(':disabled'))
      void cityAudio.unlock().then(() => cityAudio.play('click'));
  };
  const visibility = () => cityAudio.setHidden(document.hidden);
  root.addEventListener('pointerdown', gesture, { passive: true });
  root.addEventListener('keydown', gesture);
  root.addEventListener('click', click);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    root.removeEventListener('pointerdown', gesture);
    root.removeEventListener('keydown', gesture);
    root.removeEventListener('click', click);
    document.removeEventListener('visibilitychange', visibility);
    cityAudio.dispose();
  };
}
