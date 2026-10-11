import { cityMusic } from './audio/music';
import { cityAudio } from './audio/manager';
import { attachAudioControls } from './audio/controls';
import { readPreferences, type Preferences } from './ui/preferences';
import { attachTooltips } from './ui/tooltips';
import { decorateControls } from './ui/icons';
import './ui/styles/art.css';
import { t } from './ui/i18n/t';
import { registerPwa } from './pwa/register';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/toolbar.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app element');
cityAudio.setLevels(readPreferences());
cityMusic.setLevels(readPreferences());
const stopAudio = attachAudioControls(root);
window.addEventListener('webcity-preferences-change', (e) => {
  const levels = (e as CustomEvent<Preferences>).detail;
  cityAudio.setLevels(levels);
  cityMusic.setLevels(levels);
});
window.addEventListener('pagehide', stopAudio, { once: true });
if (new URLSearchParams(location.search).get('debug') === '1') {
  window.__webcityAudio = () => cityAudio.readStats();
  window.__webcityMusic = () => cityMusic.readStats();
}
const stopTooltips = attachTooltips(root);
window.addEventListener('pagehide', stopTooltips, { once: true });
const stopIcons = decorateControls(root);
window.addEventListener('pagehide', stopIcons, { once: true });
if (new URLSearchParams(location.search).get('asset-gallery') === '1')
  void import('./assetGallery').then(({ startAssetGallery }) =>
    startAssetGallery(root),
  );
else if (new URLSearchParams(location.search).get('ui-gallery') === '1')
  void import('./ui/uiGallery').then(({ startUiGallery }) =>
    startUiGallery(root),
  );
else if (new URLSearchParams(location.search).get('gallery') === '1')
  void import('./gallery').then(({ startGallery }) => startGallery(root));
else if (new URLSearchParams(location.search).get('district') === '1')
  void import('./buildingDistrict').then(({ startDistrict }) =>
    startDistrict(root),
  );
else if (
  new URLSearchParams(location.search).get('play') === '1' ||
  sessionStorage.getItem('webcity-load') !== null ||
  sessionStorage.getItem('webcity-new') !== null
)
  void import('./bootstrap')
    .then(async ({ prepareStartup }) => {
      await prepareStartup();
      await import('./game');
    })
    .catch(() => {
      const message = document.createElement('p');
      message.textContent = t('save.failed');
      const back = document.createElement('button');
      back.textContent = t('menu.back');
      back.onclick = () => {
        const url = new URL(location.href);
        url.searchParams.delete('play');
        location.assign(url);
      };
      root.append(message, back);
    });
else
  void Promise.all([
    import('./ui/screens/MainMenu'),
    import('./save/storage'),
  ]).then(async ([{ showMainMenu }, { listSaves }]) => {
    const saves = await listSaves().catch(() => []);
    showMainMenu(
      root,
      saves,
      (settings) => {
        sessionStorage.setItem('webcity-new', JSON.stringify(settings));
        location.reload();
      },
      (id) => {
        sessionStorage.setItem('webcity-load', id);
        location.reload();
      },
    );
  });
if (import.meta.env.PROD) void registerPwa();

declare global {
  interface Window {
    __webcityMusic?: () => ReturnType<typeof cityMusic.readStats>;
    __webcityAudio?: () => ReturnType<typeof cityAudio.readStats>;
  }
}
