import { t } from './i18n/t';

/** Render the initial project shell until the game systems are available. */
export function App() {
  return (
    <main className="app-shell">
      <h1>{t('app.name')}</h1>
    </main>
  );
}
