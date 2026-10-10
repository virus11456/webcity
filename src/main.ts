import { registerPwa } from './pwa/register';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/toolbar.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app element');
if (new URLSearchParams(location.search).get('ui-gallery') === '1')
  void import('./ui/uiGallery').then(({ startUiGallery }) =>
    startUiGallery(root),
  );
else if (new URLSearchParams(location.search).get('gallery') === '1')
  void import('./gallery').then(({ startGallery }) => startGallery(root));
else if (new URLSearchParams(location.search).get('district') === '1')
  void import('./buildingDistrict').then(({ startDistrict }) =>
    startDistrict(root),
  );
else void import('./game');
if (import.meta.env.PROD) void registerPwa();
