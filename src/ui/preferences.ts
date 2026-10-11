import { GRAPHICS_DEFAULTS, type GraphicsOptions } from '../data/config';
import { AUDIO, type AudioLevels } from '../data/soundConfig';
export interface Preferences extends AudioLevels, GraphicsOptions {
  quality: 'auto' | 'low' | 'medium' | 'high';
  edgeScrolling: boolean;
  dayNight: boolean;
  weather: boolean;
  uiScale: number;
}
const defaults: Preferences = {
  ...GRAPHICS_DEFAULTS,
  quality: 'auto',
  edgeScrolling: false,
  dayNight: true,
  weather: true,
  uiScale: 100,
  volume: AUDIO.volume,
  sfxVolume: AUDIO.sfxVolume,
  ambientVolume: AUDIO.ambientVolume,
  musicVolume: AUDIO.musicVolume,
};
/** Validate persisted preferences and safely fall back when browser storage is unavailable. */
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem('webcity-preferences') ?? '{}',
    ) as Partial<Preferences>;
    const volume = (n: unknown, fallback: number) =>
      typeof n === 'number' && Number.isFinite(n)
        ? Math.max(0, Math.min(100, n))
        : fallback;
    return {
      shadows: value.shadows !== false,
      postprocessing: value.postprocessing !== false,
      tiltShift: value.tiltShift !== false,
      treeDensity: volume(value.treeDensity, GRAPHICS_DEFAULTS.treeDensity),
      volume: volume(value.volume, AUDIO.volume),
      sfxVolume: volume(value.sfxVolume, AUDIO.sfxVolume),
      ambientVolume: volume(value.ambientVolume, AUDIO.ambientVolume),
      musicVolume: volume(value.musicVolume, AUDIO.musicVolume),
      quality: ['auto', 'low', 'medium', 'high'].includes(value.quality ?? '')
        ? value.quality!
        : 'auto',
      edgeScrolling: value.edgeScrolling === true,
      dayNight: value.dayNight !== false,
      weather: value.weather !== false,
      uiScale:
        typeof value.uiScale === 'number' &&
        value.uiScale >= 90 &&
        value.uiScale <= 130
          ? value.uiScale
          : 100,
    };
  } catch {
    return { ...defaults };
  }
}
/** Apply accessible font scaling and remember it for later sessions. */
export function savePreferences(value: Preferences): void {
  window.dispatchEvent(
    new CustomEvent('webcity-preferences-change', { detail: value }),
  );
  localStorage.setItem('webcity-preferences', JSON.stringify(value));
  document.documentElement.style.setProperty(
    '--ui-scale',
    String(value.uiScale / 100),
  );
}
