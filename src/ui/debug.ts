import { t } from './i18n/t';

export interface DebugStats {
  fps: number;
  calls: number;
  triangles: number;
  quality: 'low' | 'medium' | 'high';
  dpr: number;
  aspect: number;
  shadows: number;
}
/** Mount a diagnostic panel only when requested; update at the renderer's throttled interval. */
export function createDebugPanel(parent: HTMLElement): {
  update: (stats: Readonly<DebugStats>) => void;
  dispose: () => void;
} {
  const panel = document.createElement('aside');
  panel.className = 'debug-panel';
  panel.setAttribute('aria-label', t('debug.title'));
  const text = document.createTextNode('');
  panel.append(text);
  parent.append(panel);
  return {
    update(stats) {
      text.data = `${t('debug.fps')} ${stats.fps.toFixed(1)}\n${t('debug.calls')} ${stats.calls}\n${t('debug.triangles')} ${stats.triangles}\n${t('debug.quality')} ${t(`quality.${stats.quality}`)} · DPR ${stats.dpr.toFixed(2)}`;
      panel.dataset.fps = String(stats.fps);
      panel.dataset.calls = String(stats.calls);
      panel.dataset.triangles = String(stats.triangles);
      panel.dataset.quality = stats.quality;
      panel.dataset.dpr = String(stats.dpr);
      panel.dataset.aspect = String(stats.aspect);
      panel.dataset.shadows = String(stats.shadows);
    },
    dispose() {
      panel.remove();
    },
  };
}
