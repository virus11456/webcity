export interface Preferences {
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
};
/** Validate persisted preferences and safely fall back when browser storage is unavailable. */
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem('webcity-preferences') ?? '{}',
    ) as Partial<Preferences>;
    return {
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
  localStorage.setItem('webcity-preferences', JSON.stringify(value));
  document.documentElement.style.setProperty(
    '--ui-scale',
    String(value.uiScale / 100),
  );
}
