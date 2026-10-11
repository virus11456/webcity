import { t } from './i18n/t';
import type { TimingSummary } from '../core/timingWindow';

export interface DebugStats {
  frame?: TimingSummary;
  fps: number;
  calls: number;
  triangles: number;
  quality: 'low' | 'medium' | 'high';
  dpr: number;
  aspect: number;
  shadows: number;
  fogDensity: number;
  hour: number;
  postfx: number;
  tilt: number;
}
/** Mount a diagnostic panel only when requested; update at the renderer's throttled interval. */
export function createDebugPanel(parent: HTMLElement): {
  update: (stats: Readonly<DebugStats>) => void;
  worker: (stats: TimingSummary) => void;
  dispose: () => void;
} {
  const panel = document.createElement('aside');
  panel.className = 'debug-panel';
  panel.setAttribute('aria-label', t('debug.title'));
  const text = document.createTextNode('');
  panel.append(text);
  parent.append(panel);
  const observer = new ResizeObserver(() => {
    parent.style.setProperty(
      '--debug-height',
      `${panel.getBoundingClientRect().height}px`,
    );
  });
  observer.observe(panel);
  let worker: TimingSummary | undefined;
  return {
    worker(stats) {
      worker = stats;
    },
    update(stats) {
      text.data = `${t('debug.fps')} ${stats.fps.toFixed(1)}\n${t('debug.calls')} ${stats.calls}\n${t('debug.triangles')} ${stats.triangles}\n${t('debug.quality')} ${t(`quality.${stats.quality}`)} · DPR ${stats.dpr.toFixed(2)}`;
      const heap = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory?.usedJSHeapSize;
      const missing = t('debug.unavailable');
      text.data += `\n${t('debug.frame')} ${stats.frame?.p95Ms.toFixed(2) ?? missing} ms\n${t('debug.worker')} ${worker?.count ? worker.p95Ms.toFixed(2) : missing} ms\n${t('debug.heap')} ${heap === undefined ? missing : (heap / 1024 / 1024).toFixed(1) + ' MiB'}`;
      panel.dataset.frameP95Ms = String(stats.frame?.p95Ms ?? '');
      panel.dataset.frameMaxMs = String(stats.frame?.maxMs ?? '');
      panel.dataset.workerP95Ms = String(worker?.count ? worker.p95Ms : '');
      panel.dataset.workerMaxMs = String(worker?.count ? worker.maxMs : '');
      panel.dataset.workerSamples = String(worker?.count ?? 0);
      panel.dataset.heapBytes = String(heap ?? '');
      panel.dataset.fps = String(stats.fps);
      panel.dataset.calls = String(stats.calls);
      panel.dataset.triangles = String(stats.triangles);
      panel.dataset.quality = stats.quality;
      panel.dataset.dpr = String(stats.dpr);
      panel.dataset.aspect = String(stats.aspect);
      panel.dataset.shadows = String(stats.shadows);
      panel.dataset.fogDensity = String(stats.fogDensity);
      panel.dataset.hour = String(stats.hour);
      panel.dataset.postfx = String(stats.postfx);
      panel.dataset.tilt = String(stats.tilt);
    },
    dispose() {
      observer.disconnect();
      parent.style.removeProperty('--debug-height');
      panel.remove();
    },
  };
}
