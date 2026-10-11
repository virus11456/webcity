import { MapPreview } from '../components/MapPreview';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { MAP_PRESETS } from '../../data/terrain';
import type { CitySettings } from '../../world/snapshot';
import type { SaveMetadata } from '../../world/saveTypes';
import { Button } from '../components/Button';
import { Slider } from '../components/Slider';
import { t } from '../i18n/t';
import {
  readPreferences,
  savePreferences,
  type Preferences,
} from '../preferences';
import '../styles/ui-kit.css';
import '../styles/menus.css';

function randomSeed(previous: string): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return value === Number(previous) ? (value + 1) >>> 0 : value;
}

/** Settings share the same controls between the title screen and pause menu. */
export function Settings({
  apply,
}: {
  apply?: (preferences: Preferences) => void;
}) {
  const [value, setValue] = useState(readPreferences);
  const [failed, setFailed] = useState(false);
  const update = (next: Preferences) => {
    setValue(next);
    try {
      savePreferences(next);
      apply?.(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div class="menu-settings">
      <label>
        {t('debug.quality')}
        <select
          aria-label={t('debug.quality')}
          value={value.quality}
          onChange={(e) =>
            update({
              ...value,
              quality: e.currentTarget.value as Preferences['quality'],
            })
          }
        >
          {(['auto', 'low', 'medium', 'high'] as const).map((q) => (
            <option key={q} value={q}>
              {t(`quality.${q}`)}
            </option>
          ))}
        </select>
      </label>
      {(['shadows', 'postprocessing', 'tiltShift'] as const).map((key) => (
        <label class="menu-check" key={key}>
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(e) =>
              update({ ...value, [key]: e.currentTarget.checked })
            }
          />
          {t(`menu.${key}`)}
        </label>
      ))}
      <Slider
        label={t('menu.treeDensity')}
        min={0}
        max={100}
        value={value.treeDensity}
        unit="%"
        onInput={(treeDensity) => update({ ...value, treeDensity })}
      />
      <p>{t('menu.graphicsHint')}</p>
      <label class="menu-check">
        <input
          type="checkbox"
          checked={value.edgeScrolling}
          onChange={(e) =>
            update({ ...value, edgeScrolling: e.currentTarget.checked })
          }
        />
        {t('input.edge')}
      </label>
      <label class="menu-check">
        <input
          type="checkbox"
          checked={value.dayNight}
          onChange={(e) =>
            update({ ...value, dayNight: e.currentTarget.checked })
          }
        />
        {t('menu.dayNight')}
      </label>
      <label class="menu-check">
        <input
          type="checkbox"
          checked={value.weather}
          onChange={(e) =>
            update({ ...value, weather: e.currentTarget.checked })
          }
        />
        {t('menu.weather')}
      </label>
      <Slider
        label={t('menu.scale')}
        min={90}
        max={130}
        value={value.uiScale}
        unit="%"
        onInput={(uiScale) => update({ ...value, uiScale })}
      />
      {(['volume', 'sfxVolume', 'ambientVolume', 'musicVolume'] as const).map(
        (key) => (
          <Slider
            key={key}
            label={t(`menu.${key}`)}
            min={0}
            max={100}
            value={value[key]}
            unit="%"
            onInput={(n) => update({ ...value, [key]: n })}
          />
        ),
      )}
      <p>{t('menu.audioHint')}</p>
      <p>{t('menu.musicHint')}</p>
      {failed && <p role="alert">{t('menu.settingsFailed')}</p>}
    </div>
  );
}
function MainMenu({
  saves,
  start,
  load,
}: {
  saves: SaveMetadata[];
  start: (settings: CitySettings) => void;
  load: (id: string) => void;
}) {
  const [view, setView] = useState<'home' | 'new' | 'load' | 'settings'>(
    'home',
  );
  const [mapId, setMapId] = useState<string>(MAP_PRESETS[0].id);
  const [seed, setSeed] = useState(String(MAP_PRESETS[0].seed));
  const [name, setName] = useState(t('menu.defaultName'));
  const [tutorial, setTutorial] = useState(true);
  const [mode, setMode] = useState<CitySettings['mode']>('normal');
  const [install, setInstall] = useState(
    !sessionStorage.getItem('webcity-install-dismissed'),
  );
  const latest = [...saves].sort((a, b) => b.savedAt - a.savedAt)[0];
  const ios =
    /iPad|iPhone/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches;
  return (
    <main class="main-menu">
      <div class="menu-brand">
        <span class="menu-eyebrow">{t('menu.eyebrow')}</span>
        <h1>WebCity</h1>
        <p>{t('menu.tagline')}</p>
        <div class="menu-city" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ height: `${35 + ((i * 37) % 110)}px` }} />
          ))}
        </div>
      </div>
      <section class="menu-card" aria-label={t('menu.title')}>
        {view === 'home' && (
          <>
            <h2>{t('menu.title')}</h2>
            <Button
              variant="primary"
              disabled={!latest}
              onClick={() => latest && load(latest.id)}
            >
              {t('menu.continue')}
            </Button>
            {latest && (
              <small>
                {latest.settings.cityName} · {t('hud.population')}{' '}
                {latest.population}
              </small>
            )}
            <Button onClick={() => setView('new')}>{t('menu.new')}</Button>
            <Button disabled={!saves.length} onClick={() => setView('load')}>
              {t('save.load')}
            </Button>
            <Button onClick={() => setView('settings')}>
              {t('menu.settings')}
            </Button>
          </>
        )}
        {view === 'new' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                name.trim() &&
                name.trim().length <= 64 &&
                Number.isSafeInteger(Number(seed))
              )
                start({
                  starterRoads: true,
                  tutorial,
                  cityName: name.trim(),
                  mapId,
                  seed: Number(seed),
                  mode,
                });
            }}
          >
            <h2>{t('menu.new')}</h2>
            <label>
              {t('menu.cityName')}
              <input
                required
                maxLength={64}
                value={name}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </label>
            <label>
              {t('menu.map')}
              <select
                value={mapId}
                onChange={(e) => {
                  const id = e.currentTarget.value;
                  const preset = MAP_PRESETS.find((p) => p.id === id);
                  setMapId(id);
                  setSeed(String(preset?.seed ?? randomSeed(seed)));
                }}
              >
                <option value="random">{t('menu.map.random')}</option>
                {MAP_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(`menu.map.${p.id}`)}
                  </option>
                ))}
              </select>
            </label>
            <MapPreview mapId={mapId} seed={seed} />
            <label>
              {t('menu.seed')}
              <input
                required
                type="number"
                step="1"
                value={seed}
                onInput={(e) => setSeed(e.currentTarget.value)}
              />
            </label>
            {mapId === 'random' && (
              <Button onClick={() => setSeed(String(randomSeed(seed)))}>
                {t('menu.reroll')}
              </Button>
            )}
            <label>
              {t('menu.mode')}
              <select
                value={mode}
                onChange={(e) =>
                  setMode(e.currentTarget.value as CitySettings['mode'])
                }
              >
                {(['normal', 'easy', 'sandbox'] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`menu.mode.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label class="menu-check">
              <input
                type="checkbox"
                checked={tutorial}
                onChange={(e) => setTutorial(e.currentTarget.checked)}
              />
              {t('tutorial.enable')}
            </label>
            <Button type="submit" variant="primary">
              {t('menu.start')}
            </Button>
          </form>
        )}
        {view === 'load' && (
          <>
            <h2>{t('save.load')}</h2>
            {saves.map((s) => (
              <Button key={s.id} onClick={() => load(s.id)}>
                {s.settings.cityName} · {t('save.day')} {s.day + 1} ·{' '}
                {s.id === 'auto'
                  ? t('save.auto')
                  : `${t('save.slot')} ${Number(s.id) + 1}`}
              </Button>
            ))}
          </>
        )}
        {view === 'settings' && (
          <>
            <h2>{t('menu.settings')}</h2>
            <Settings />
          </>
        )}
        {view !== 'home' && (
          <Button onClick={() => setView('home')}>{t('menu.back')}</Button>
        )}
        {ios && !standalone && install && (
          <aside class="install-hint">
            <p>{t('menu.install')}</p>
            <Button
              onClick={() => {
                sessionStorage.setItem('webcity-install-dismissed', '1');
                setInstall(false);
              }}
            >
              {t('menu.dismiss')}
            </Button>
          </aside>
        )}
      </section>
    </main>
  );
}
/** Render the title screen without allocating a Worker or WebGL context. */
export function showMainMenu(
  root: HTMLElement,
  saves: SaveMetadata[],
  start: (settings: CitySettings) => void,
  load: (id: string) => void,
): void {
  document.documentElement.style.setProperty(
    '--ui-scale',
    String(readPreferences().uiScale / 100),
  );
  render(<MainMenu saves={saves} start={start} load={load} />, root);
}
