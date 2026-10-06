import { DistrictRenderer } from './render/buildings/districtRenderer';
import { createBuildingDistrict } from './ui/buildingDistrict';
import { t } from './ui/i18n/t';
import './ui/styles/gallery.css';
import './ui/styles/district.css';
declare global {
  interface Window {
    __webcityDistrict?: () => ReturnType<DistrictRenderer['readStats']>;
  }
}
export function startDistrict(root: HTMLElement): void {
  let renderer: DistrictRenderer | undefined;
  const ui = createBuildingDistrict(root, {
    progress: (p) => renderer?.setProgress(p),
    play: () => renderer?.play(),
    abandon: () => renderer?.abandon(),
    demolish: () => renderer?.demolish(),
    load: (n) => renderer?.load(n),
  });
  try {
    renderer = new DistrictRenderer(ui.canvas, ui.update);
    if (new URLSearchParams(location.search).get('debug') === '1')
      window.__webcityDistrict = () => renderer!.readStats();
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
      delete window.__webcityDistrict;
    });
}
