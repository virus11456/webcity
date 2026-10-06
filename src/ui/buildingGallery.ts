import {
  BUILDING_FORM as F,
  BUILDING_ZONES,
  type BuildingSpec,
} from '../data/buildingAppearance';
import { ZONES } from '../data/zones';
import { buildingCatalog } from '../world/buildingCatalog';
import { constructionVisual } from '../world/constructionVisual';
import { t } from './i18n/t';
interface Actions {
  models(specs: BuildingSpec[], slots: HTMLElement[]): void;
  progress(value: number): void;
  play(value: boolean): void;
  night(value: boolean): void;
  rotate(delta: number): void;
}
/** Accessible gallery filters and construction transport, independent of Three.js. */
export function createBuildingGallery(root: HTMLElement, actions: Actions) {
  const shell = document.createElement('main');
  shell.className = 'gallery-shell';
  const header = document.createElement('header');
  header.className = 'gallery-header';
  const title = document.createElement('div'),
    heading = document.createElement('h1'),
    intro = document.createElement('p');
  heading.textContent = t('gallery.title');
  intro.textContent = t('gallery.subtitle');
  title.append(heading, intro);
  const home = document.createElement('a');
  home.href = location.pathname;
  home.textContent = t('gallery.home');
  const district = document.createElement('a');
  district.href = '?district=1';
  district.textContent = t('district.title');
  header.append(title, district, home);
  const stage = document.createElement('section');
  stage.className = 'gallery-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'gallery-canvas';
  canvas.setAttribute('aria-label', t('gallery.preview'));
  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  stage.append(canvas, grid);
  const controls = document.createElement('section');
  controls.className = 'gallery-controls';
  controls.setAttribute('aria-label', t('gallery.controls'));
  const filters = document.createElement('div');
  filters.className = 'gallery-filters';
  function select(label: string, options: [string, string][]) {
    const l = document.createElement('label'),
      s = document.createElement('select');
    l.append(label);
    s.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      s.append(o);
    }
    l.append(s);
    filters.append(l);
    return s;
  }
  const zone = select(t('gallery.zone'), [
    ['featured', t('gallery.featured')],
    ['all', t('gallery.all')],
    ...BUILDING_ZONES.map((z) => [z, t(`zone.${z}`)] as [string, string]),
  ]);
  const level = select(t('gallery.level'), [
    ['all', t('gallery.allLevels')],
    ...[1, 2, 3, 4, 5].map((n) => [String(n), `Lv ${n}`] as [string, string]),
  ]);
  const size = select(t('gallery.size'), [
    ['all', t('gallery.allSizes')],
    ...Array.from({ length: 16 }, (_, i) => {
      const v = `${Math.floor(i / 4) + 1}×${(i % 4) + 1}`;
      return [v, v] as [string, string];
    }),
  ]);
  function button(label: string, parent: HTMLElement, click: () => void) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = click;
    parent.append(b);
    return b;
  }
  let seed = F.gallery.defaultSeed as number,
    page = 0,
    playing = false,
    night = false,
    focused: BuildingSpec | null = null;
  button(t('gallery.variant'), filters, () => {
    seed++;
    focused = null;
    refresh();
  });
  const light = button(t('gallery.night'), filters, () => {
    night = !night;
    light.setAttribute('aria-pressed', String(night));
    shell.dataset.night = String(night);
    actions.night(night);
  });
  light.setAttribute('aria-pressed', 'false');
  const nav = document.createElement('div');
  nav.className = 'gallery-pagination';
  const prev = button(t('gallery.prev'), nav, () => {
      page--;
      focused = null;
      refresh();
    }),
    count = document.createElement('output');
  nav.append(count);
  const next = button(t('gallery.next'), nav, () => {
    page++;
    focused = null;
    refresh();
  });
  const overview = button(t('gallery.overview'), nav, () => {
    focused = null;
    refresh();
  });
  button('↶', nav, () => actions.rotate(-Math.PI / 6)).setAttribute(
    'aria-label',
    t('gallery.rotateLeft'),
  );
  button('↷', nav, () => actions.rotate(Math.PI / 6)).setAttribute(
    'aria-label',
    t('gallery.rotateRight'),
  );
  const transport = document.createElement('div');
  transport.className = 'gallery-transport';
  const play = button(t('gallery.play'), transport, () =>
    actions.play(!playing),
  );
  const progress = document.createElement('input');
  progress.type = 'range';
  progress.min = '0';
  progress.max = '100';
  progress.value = '100';
  progress.setAttribute('aria-label', t('gallery.progress'));
  progress.oninput = () => {
    actions.play(false);
    actions.progress(Number(progress.value) / 100);
  };
  transport.append(progress);
  const state = document.createElement('output');
  state.className = 'gallery-progress';
  state.setAttribute('aria-live', 'off');
  transport.append(state);
  const checkpoints = document.createElement('div');
  checkpoints.className = 'gallery-checkpoints';
  for (const [i, v] of F.construction.checkpoints.entries())
    button(
      t(
        (
          [
            'gallery.foundation',
            'gallery.half',
            'gallery.nearly',
            'gallery.complete',
          ] as const
        )[i]!,
      ),
      checkpoints,
      () => {
        actions.play(false);
        actions.progress(v);
      },
    );
  const note = document.createElement('p');
  note.className = 'gallery-note';
  note.textContent = t('gallery.note');
  controls.append(filters, nav, transport, checkpoints, note);
  shell.append(header, stage, controls);
  root.replaceChildren(shell);
  function refresh() {
    let specs = buildingCatalog(seed);
    if (zone.value === 'featured')
      specs = BUILDING_ZONES.map((z) => ({
        zone: z,
        level: 2,
        w: 2,
        d: 2,
        seed,
      }));
    else if (zone.value !== 'all')
      specs = specs.filter((s) => s.zone === zone.value);
    if (level.value !== 'all')
      specs = specs.filter((s) => s.level === Number(level.value));
    if (size.value !== 'all')
      specs = specs.filter((s) => `${s.w}×${s.d}` === size.value);
    page = Math.max(
      0,
      Math.min(page, Math.ceil(specs.length / F.gallery.pageSize) - 1),
    );
    const visible = focused
      ? [focused]
      : specs.slice(page * F.gallery.pageSize, (page + 1) * F.gallery.pageSize);
    grid.replaceChildren();
    grid.dataset.single = String(Boolean(focused) || visible.length === 1);
    grid.dataset.total = String(specs.length);
    const slots = visible.map((s) => {
      const card = document.createElement('button');
      card.className = 'gallery-card';
      card.dataset.zone = s.zone;
      card.dataset.level = String(s.level);
      card.dataset.size = `${s.w}×${s.d}`;
      const label = document.createElement('span');
      label.textContent = `${t(`zone.${s.zone}`)} · Lv ${s.level} · ${s.w}×${s.d}`;
      card.append(label);
      card.setAttribute(
        'aria-label',
        `${t('gallery.enlarge')} ${label.textContent}`,
      );
      card.onclick = () => {
        focused = focused ? null : s;
        refresh();
      };
      grid.append(card);
      return card;
    });
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.textContent = t('gallery.empty');
      grid.append(empty);
    }
    count.textContent = focused
      ? t('gallery.detail')
      : `${specs.length ? page * F.gallery.pageSize + 1 : 0}–${Math.min((page + 1) * F.gallery.pageSize, specs.length)} / ${specs.length}`;
    prev.disabled = Boolean(focused) || page === 0;
    next.disabled =
      Boolean(focused) || (page + 1) * F.gallery.pageSize >= specs.length;
    overview.hidden = !focused;
    actions.models(visible, slots);
  }
  zone.onchange = () => {
    page = 0;
    focused = null;
    level.value = size.value = 'all';
    for (const o of level.options)
      o.disabled =
        zone.value in ZONES &&
        Number(o.value) > ZONES[zone.value as keyof typeof ZONES].maxLevel;
    refresh();
  };
  for (const s of [level, size])
    s.onchange = () => {
      page = 0;
      focused = null;
      refresh();
    };
  let previousPercent = -1;
  let previousStage = '';
  const visual = constructionVisual(1);
  return {
    canvas,
    refresh,
    update(p: number, running: boolean) {
      if (playing !== running)
        play.textContent = t(running ? 'gallery.pause' : 'gallery.play');
      playing = running;
      const percent = Math.round(p * 100);
      const stage = constructionVisual(p, visual).stage;
      if (percent !== previousPercent || stage !== previousStage) {
        previousStage = stage;
        previousPercent = percent;
        progress.value = String(percent);
        state.textContent = `${t(`gallery.${stage}`)} ${percent}%`;
        shell.dataset.stage = stage;
      }
    },
    dispose() {
      shell.remove();
    },
  };
}
