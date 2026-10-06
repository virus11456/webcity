import { GalleryRenderer } from './render/buildings/galleryRenderer';
import { createBuildingGallery } from './ui/buildingGallery';
import { t } from './ui/i18n/t';
import './ui/styles/gallery.css';

declare global {
  interface Window {
    __webcityGallery?: () => ReturnType<GalleryRenderer['readStats']>;
  }
}
/** Compose the isolated appearance gallery without creating a simulation worker or city terrain. */
export function startGallery(root: HTMLElement): void {
  let renderer: GalleryRenderer | undefined;
  const ui = createBuildingGallery(root, {
    models: (s, c) => renderer?.setSpecs(s, c),
    progress: (v) => renderer?.setProgress(v),
    play: (v) => renderer?.setPlaying(v),
    night: (v) => renderer?.setNight(v),
    rotate: (v) => renderer?.rotate(v),
  });
  try {
    renderer = new GalleryRenderer(ui.canvas, ui.update);
    ui.refresh();
    ui.update(1, false);
    if (new URLSearchParams(location.search).get('debug') === '1')
      window.__webcityGallery = () => renderer!.readStats();
  } catch {
    const error = document.createElement('p');
    error.className = 'render-status';
    error.textContent = t('render.unavailable');
    root.append(error);
  }
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      renderer?.dispose();
      ui.dispose();
      delete window.__webcityGallery;
    });
}
