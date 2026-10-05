import { t } from './i18n/t';

/** Render the canvas host and accessible title for the city preview. */
export function App() {
  return (
    <main className="app-shell">
      <canvas className="city-canvas" aria-label={t('render.preview')} />
      <p className="render-status" role="status" hidden />
      <h1>{t('app.name')}</h1>
    </main>
  );
}
