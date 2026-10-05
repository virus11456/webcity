import { t } from './i18n/t';

/** Render the canvas host and accessible title for the city preview. */
export function App({
  onEdgeScrollChange,
}: {
  onEdgeScrollChange: (enabled: boolean) => void;
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
      <h1>{t('app.name')}</h1>
      <aside
        className="input-help"
        id="input-help"
        aria-label={t('input.title')}
      >
        <strong>{t('input.preview')}</strong>
        <p className="desktop-help">{t('input.desktop')}</p>
        <p className="touch-help">{t('input.touch')}</p>
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
