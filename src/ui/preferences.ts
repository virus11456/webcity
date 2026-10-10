import { AUDIO, type AudioLevels } from '../data/soundConfig';
export interface Preferences extends AudioLevels {
  quality: 'auto' | 'low' | 'medium' | 'high';
  edgeScrolling: boolean;
  dayNight: boolean;
  uiScale: number;
}
const defaults: Preferences = {
  quality: 'auto',
  edgeScrolling: false,
  dayNight: true,
  uiScale: 100,
  volume: AUDIO.volume,
  sfxVolume: AUDIO.sfxVolume,
  ambientVolume: AUDIO.ambientVolume,
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
      volume: volume(value.volume, AUDIO.volume),
      sfxVolume: volume(value.sfxVolume, AUDIO.sfxVolume),
      ambientVolume: volume(value.ambientVolume, AUDIO.ambientVolume),
      quality: ['auto', 'low', 'medium', 'high'].includes(value.quality ?? '')
        ? value.quality!
        : 'auto',
      edgeScrolling: value.edgeScrolling === true,
      dayNight: value.dayNight !== false,
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
