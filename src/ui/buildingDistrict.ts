import { t } from './i18n/t';
interface Actions {
  progress(value: number): void;
  play(): void;
  abandon(): void;
  demolish(): void;
  load(count: number): void;
}
export function createBuildingDistrict(root: HTMLElement, actions: Actions) {
  const shell = document.createElement('main');
  shell.className = 'district-shell';
  const header = document.createElement('header');
  header.className = 'gallery-header';
  const title = document.createElement('div'),
    h = document.createElement('h1'),
    intro = document.createElement('p');
  h.textContent = t('district.title');
  intro.textContent = t('district.note');
  title.append(h, intro);
  const back = document.createElement('a');
  back.href = '?gallery=1';
  back.textContent = t('district.back');
  header.append(title, back);
  const stage = document.createElement('section');
  stage.className = 'gallery-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'gallery-canvas';
  canvas.setAttribute('aria-label', t('district.canvas'));
  stage.append(canvas);
  const stats = document.createElement('output');
  stats.className = 'district-stats';
  stage.append(stats);
  const controls = document.createElement('section');
  controls.className = 'district-controls';
  controls.setAttribute('aria-label', t('district.controls'));
  const button = (key: Parameters<typeof t>[0], action: () => void) => {
    const b = document.createElement('button');
    b.textContent = t(key);
    b.onclick = action;
    controls.append(b);
    return b;
  };
  button('gallery.foundation', () => actions.progress(0));
  button('gallery.half', () => actions.progress(0.5));
  button('gallery.nearly', () => actions.progress(0.9));
  button('gallery.complete', () => actions.progress(1));
  const play = button('gallery.play', () => actions.play());
  button('district.abandon', () => actions.abandon());
  button('district.demolish', () => actions.demolish());
  button('district.restore', () => actions.load(4));
  button('district.stress', () => actions.load(5000));
  const hint = document.createElement('p');
  hint.textContent = t('district.gestures');
  hint.className = 'district-hint';
  controls.append(hint);
  shell.append(header, stage, controls);
  root.append(shell);
  return {
    canvas,
    update(s: {
      buildings: number;
      pending: number;
      calls: number;
      fps: number;
      progress: number;
      playing: boolean;
    }) {
      stats.textContent = `${t('district.count')} ${s.buildings.toLocaleString()} · ${t('debug.calls')} ${s.calls} · ${Math.round(s.fps)} FPS${s.pending ? ` · ${t('district.loading')} ${s.pending}` : ''}`;
      play.textContent = t(s.playing ? 'gallery.pause' : 'gallery.play');
      canvas.dataset.progress = String(Math.round(s.progress * 100));
    },
    dispose() {
      shell.remove();
    },
  };
}
