import { Icon } from './components/Icon';
import type { CityView } from '../data/terrain';
import { t } from './i18n/t';

/** City preview navigation with functional viewpoints and clear implementation status. */
export function App({
  onEdgeScrollChange,
  onViewChange,
}: {
  onEdgeScrollChange: (enabled: boolean) => void;
  onViewChange: (view: CityView) => void;
}) {
  return (
    <main className="app-shell">
      <canvas
        className="city-canvas"
        aria-label={t('render.preview')}
        tabIndex={0}
        aria-describedby="input-help"
      />
      <p className="render-status" role="status" hidden />
      <nav className="view-nav" aria-label={t('city.views')}>
        <button onClick={() => onViewChange('center')}>
          <Icon name="tower" />
          {t('city.center')}
        </button>
        <button onClick={() => onViewChange('river')}>
          <Icon name="water" />
          {t('city.river')}
        </button>
        <button onClick={() => onViewChange('overview')}>
          <Icon name="layers" />
          {t('city.overview')}
        </button>
        <a href="?gallery=1">{t('gallery.title')}</a>
      </nav>
      <aside
        className="input-help"
        id="input-help"
        aria-label={t('input.title')}
      >
        <strong>{t('city.explore')}</strong>
        <p className="desktop-help">{t('input.desktop')}</p>
        <p className="touch-help">{t('input.touch')}</p>
        <p className="preview-note">{t('city.inDevelopment')}</p>
        <label className="edge-setting">
          <input
            type="checkbox"
            onChange={(e) => onEdgeScrollChange(e.currentTarget.checked)}
          />
          {t('input.edge')}
        </label>
      </aside>
    </main>
  );
}
