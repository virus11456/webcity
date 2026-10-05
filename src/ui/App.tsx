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
      <header className="city-header">
        <div className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div>
          <h1>{t('app.name')}</h1>
          <span>{t('city.name')}</span>
        </div>
        <span className="preview-badge">{t('city.preview')}</span>
      </header>
      <nav className="view-nav" aria-label={t('city.views')}>
        <button onClick={() => onViewChange('center')}>
          <span aria-hidden="true">▥</span>
          {t('city.center')}
        </button>
        <button onClick={() => onViewChange('river')}>
          <span aria-hidden="true">≈</span>
          {t('city.river')}
        </button>
        <button onClick={() => onViewChange('overview')}>
          <span aria-hidden="true">⌗</span>
          {t('city.overview')}
        </button>
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
