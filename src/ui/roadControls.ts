import { FEATURES } from '../data/milestones';
import { INTERSECTIONS } from '../data/intersections';
import { ROAD_RULES, ROADS, type RoadTypeId } from '../data/roads';
import type { RoadMode, RoadToolState } from '../tools/roadTool';
import { t } from './i18n/t';
import { catalogIcon, createBuildCatalog } from './buildCatalog';
import { layout, observeLayout } from './store';
import { unlockHint } from './helpText';

interface RoadActions {
  enter(): void;
  explore(): void;
  zone(): void;
  power(): void;
  water(): void;
  service?(): void;
  unique?(): void;
  bus?(): void;
  metro?(): void;
  tram?(): void;
  district?(): void;
  terraform?(): void;
  policy?(): void;
  bulldoze(): void;
  demo(): void;
  confirm(): void;
  cancel(): void;
  type(type: RoadTypeId): void;
  mode(mode: RoadMode): void;
  angle(enabled: boolean): void;
  elevation(value: number): void;
  junction(control: 'none' | 'lights' | 'stop', banLeft: boolean): void;
}
/** Accessible construction controls; geometry and worker authority stay outside the UI layer. */
export function createRoadControls(parent: HTMLElement, actions: RoadActions) {
  const panel = document.createElement('section');
  panel.className = 'road-controls';
  panel.setAttribute('aria-label', t('road.title'));
  const button = (key: Parameters<typeof t>[0], run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t(key);
    b.addEventListener('click', run);
    return b;
  };
  let terraformActive = false,
    terraformPending = false;
  let construction = false;
  let zoneActive = false,
    zonePending = false;
  let bulldozeActive = false,
    bulldozePending = false;
  let powerActive = false,
    powerPending = false;
  let uniqueActive = false;
  let serviceActive = false,
    servicePending = false;
  let waterActive = false,
    waterPending = false;
  let districtActive = false,
    districtPending = false;
  let tramActive = false,
    tramPending = false;
  let metroActive = false,
    metroPending = false;
  let busActive = false,
    busPending = false;
  let latest: Readonly<RoadToolState> | undefined;
  const enter = button('road.enter', () => {
    construction = true;
    panel.dataset.construction = 'true';
    body.hidden = false;
    enter.hidden = true;
    actions.enter();
  });
  const body = document.createElement('div');
  body.className = 'road-body';
  body.hidden = true;
  const heading = document.createElement('div');
  heading.className = 'road-heading';
  const title = document.createElement('strong');
  title.textContent = t('road.title');
  const money = document.createElement('span');
  money.className = 'road-money';
  heading.append(title, money);
  const tabs = document.createElement('div');
  tabs.className = 'road-row road-tabs';
  const draw = button('road.draw', actions.enter),
    zones = button('zone.tab', actions.zone),
    power = button('power.tab', actions.power),
    water = button('water.tab', actions.water),
    service = button('service.tab', () => actions.service?.()),
    unique = button('unique.tab', () => actions.unique?.()),
    bus = button('bus.tab', () => actions.bus?.()),
    metro = button('metro.tab', () => actions.metro?.()),
    policy = button('policy.title', () => actions.policy?.()),
    district = button('district.tab', () => actions.district?.()),
    terraform = button('terraform.tab', () => actions.terraform?.()),
    tram = button('tram.tab', () => actions.tram?.()),
    bulldoze = button('bulldoze.tab', actions.bulldoze),
    explore = button('road.explore', actions.explore),
    demo = button('road.demo', () => {
      construction = false;
      panel.dataset.construction = 'false';
      body.hidden = true;
      enter.hidden = false;
      actions.demo();
    });
  enter.dataset.tutorial = 'enter';
  for (const [button, lesson] of [
    [draw, 'road'],
    [zones, 'zone'],
    [power, 'power'],
    [water, 'water'],
  ] as const)
    button.dataset.tutorial = lesson;
  tabs.setAttribute('aria-label', t('toolbar.categories'));
  for (const [button, category] of [
    [draw, 'road'],
    [zones, 'zone'],
    [power, 'power'],
    [water, 'water'],
    [service, 'service'],
    [unique, 'tower'],
    [bus, 'bus'],
    [metro, 'bus'],
    [tram, 'bus'],
    [district, 'zone'],
    [policy, 'settings'],
    [terraform, 'layers'],
    [bulldoze, 'bulldoze'],
    [explore, 'explore'],
    [demo, 'tower'],
  ] as const)
    button.prepend(catalogIcon(category));
  tabs.append(
    draw,
    zones,
    district,
    terraform,
    policy,
    power,
    water,
    service,
    unique,
    bus,
    metro,
    tram,
    bulldoze,
    explore,
    demo,
  );
  const featureLocks = (
    [
      [district, 'district_tool'],
      [policy, 'policies'],
      [bus, 'bus'],
      [metro, 'metro'],
      [tram, 'bus'],
    ] as const
  ).map(([button, id]) => {
    const unlock = FEATURES.find((f) => f.id === id)!.unlock,
      lock = document.createElement('span');
    lock.className = 'toolbar-feature-lock';
    lock.setAttribute('aria-hidden', 'true');
    lock.append(catalogIcon('lock'));
    button.append(lock);
    return { button, lock, unlock };
  });
  const future = document.createElement('details');
  future.className = 'toolbar-future';
  const futureLabel = document.createElement('summary');
  futureLabel.textContent = t('toolbar.future');
  const futureItems = document.createElement('p');
  futureItems.textContent = t('toolbar.futureItems');
  future.append(futureLabel, futureItems);
  const options = document.createElement('div');
  options.className = 'road-row road-options';
  const typeLabel = document.createElement('label');
  typeLabel.textContent = t('road.type');
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('road.type'));
  for (const type of Object.keys(ROADS) as RoadTypeId[]) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = t(`road.${type}`);
    select.append(option);
  }
  select.addEventListener('change', () =>
    actions.type(select.value as RoadTypeId),
  );
  typeLabel.append(select);
  const angleLabel = document.createElement('label');
  angleLabel.className = 'road-angle';
  const angle = document.createElement('input');
  angle.type = 'checkbox';
  angle.checked = true;
  angle.addEventListener('change', () => actions.angle(angle.checked));
  angleLabel.append(angle, t('road.angle'));
  options.append(typeLabel, angleLabel);
  const catalog = createBuildCatalog(select, 'road');
  const roadMode = document.createElement('select');
  roadMode.setAttribute('aria-label', t('road.mode'));
  for (const mode of [
    'straight',
    'curve',
    'free',
    'upgrade',
    'junction',
  ] as const) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = t(`road.mode.${mode}`);
    roadMode.append(option);
  }
  roadMode.addEventListener('change', () =>
    actions.mode(roadMode.value as RoadMode),
  );
  options.append(roadMode);
  const heightRow = document.createElement('div');
  heightRow.className = 'road-row';
  const lower = button('road.lower', () =>
    actions.elevation((latest?.elevation ?? 0) - ROAD_RULES.elevationStepM),
  );
  const raise = button('road.raise', () =>
    actions.elevation((latest?.elevation ?? 0) + ROAD_RULES.elevationStepM),
  );
  const heightLabel = document.createElement('output');
  heightLabel.setAttribute('aria-live', 'polite');
  heightRow.append(lower, heightLabel, raise);
  const junctionRow = document.createElement('div');
  junctionRow.className = 'road-row';
  const controlSelect = document.createElement('select');
  controlSelect.setAttribute('aria-label', t('road.junctionControl'));
  for (const value of ['none', 'lights', 'stop'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(`road.junction.${value}`);
    controlSelect.append(option);
  }
  const banLabel = document.createElement('label');
  banLabel.className = 'road-angle';
  const ban = document.createElement('input');
  ban.type = 'checkbox';
  ban.setAttribute('aria-label', t('road.banLeft'));
  banLabel.append(ban, t('road.banLeft'));
  const junctionChange = () =>
    actions.junction(
      controlSelect.value as 'none' | 'lights' | 'stop',
      ban.checked,
    );
  ban.addEventListener('change', junctionChange);
  controlSelect.addEventListener('change', junctionChange);
  junctionRow.append(controlSelect, banLabel);
  const metrics = document.createElement('output');
  metrics.className = 'road-metrics';
  const status = document.createElement('p');
  status.className = 'road-status';
  status.setAttribute('role', 'status');
  const confirmRow = document.createElement('div');
  confirmRow.className = 'road-row tool-actions';
  const confirm = button('road.confirm', actions.confirm),
    cancel = button('road.cancel', actions.cancel);
  confirmRow.append(confirm, cancel);
  const note = document.createElement('small');
  note.textContent = t('road.temporary');
  const details = document.createElement('div');
  details.append(
    catalog.host,
    options,
    heightRow,
    junctionRow,
    metrics,
    status,
    confirmRow,
  );
  const zoneHost = document.createElement('div');
  zoneHost.hidden = true;
  const bulldozeHost = document.createElement('div');
  bulldozeHost.hidden = true;
  const powerHost = document.createElement('div');
  powerHost.hidden = true;
  const waterHost = document.createElement('div');
  waterHost.hidden = true;
  const terraformHost = document.createElement('div');
  terraformHost.hidden = true;
  const districtHost = document.createElement('div');
  districtHost.hidden = true;
  const tramHost = document.createElement('div');
  tramHost.hidden = true;
  const metroHost = document.createElement('div');
  metroHost.hidden = true;
  const busHost = document.createElement('div');
  busHost.hidden = true;
  const serviceHost = document.createElement('div');
  serviceHost.hidden = true;
  const growthHost = document.createElement('div');
  body.append(
    heading,
    details,
    zoneHost,
    bulldozeHost,
    powerHost,
    waterHost,
    serviceHost,
    busHost,
    metroHost,
    tramHost,
    terraformHost,
    districtHost,
    growthHost,
    note,
    future,
  );
  const content = document.createElement('div');
  content.className = 'toolbar-content';
  content.append(...Array.from(body.childNodes));
  const navigation = document.createElement('div');
  navigation.className = 'toolbar-navigation';
  tabs.id = 'construction-tool-tabs';
  let expanded = false;
  const toggleTools = button('toolbar.allTools', () => setExpanded(!expanded));
  toggleTools.className = 'toolbar-toggle';
  toggleTools.setAttribute('aria-controls', tabs.id);
  const setExpanded = (value: boolean) => {
    expanded = value;
    panel.dataset.toolsExpanded = String(value);
    toggleTools.setAttribute('aria-expanded', String(value));
    toggleTools.replaceChildren(
      catalogIcon(value ? 'close' : 'zone'),
      t(value ? 'toolbar.closeTools' : 'toolbar.allTools'),
    );
  };
  setExpanded(false);
  tabs.addEventListener('click', (event) => {
    const selected = (event.target as Element).closest('button');
    if (!expanded || !selected || selected.disabled) return;
    setExpanded(false);
    requestAnimationFrame(() =>
      selected.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    );
  });
  navigation.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && expanded) {
      event.stopPropagation();
      setExpanded(false);
      toggleTools.focus();
    }
  });
  navigation.append(toggleTools, tabs);
  body.append(content, navigation);
  panel.append(enter, body);
  parent.append(panel);
  const stopLayout = observeLayout();
  const stopSignal = layout.subscribe((value) => {
    panel.dataset.layout = value;
    setExpanded(false);
  });
  const shortcut = (event: KeyboardEvent) => {
    const target = event.target;
    if (
      !construction ||
      event.repeat ||
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      !(target instanceof HTMLElement) ||
      (!panel.contains(target) && target.tagName !== 'CANVAS') ||
      target.closest(
        'input, select, textarea, [contenteditable="true"], dialog',
      )
    )
      return;
    if (
      latest?.active &&
      !latest.pending &&
      ['PageUp', 'PageDown'].includes(event.code)
    ) {
      event.preventDefault();
      actions.elevation(
        latest.elevation +
          (event.code === 'PageUp' ? 1 : -1) * ROAD_RULES.elevationStepM,
      );
    }
    const choice = (
      {
        Digit4: draw,
        Digit5: zones,
        Digit6: power,
        Digit7: water,
        Digit8: bulldoze,
      } as Record<string, HTMLButtonElement>
    )[event.code];
    if (choice && !choice.disabled) {
      event.preventDefault();
      choice.click();
    }
    if (
      event.code === 'Escape' &&
      panel.contains(target) &&
      !explore.disabled
    ) {
      event.preventDefault();
      actions.explore();
    }
  };
  window.addEventListener('keydown', shortcut);
  const hint = document.createElement('small');
  hint.className = 'toolbar-shortcuts';
  hint.textContent = t('toolbar.shortcuts');
  content.append(hint);
  const format = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
  return {
    showCity() {
      enter.click();
      explore.click();
    },
    busHost,
    metroHost,
    tramHost,
    terraformHost,
    districtHost,
    updateTerraform(active: boolean, pending: boolean) {
      terraformActive = active;
      terraformPending = pending;
      if (latest) this.update(latest);
    },
    updateDistrict(active: boolean, pending: boolean) {
      districtActive = active;
      districtPending = pending;
      if (latest) this.update(latest);
    },
    updateTram(active: boolean, pending: boolean) {
      tramActive = active;
      tramPending = pending;
      if (latest) this.update(latest);
    },
    updateMetro(active: boolean, pending: boolean) {
      metroActive = active;
      metroPending = pending;
      if (latest) this.update(latest);
    },
    updateBus(active: boolean, pending: boolean) {
      busActive = active;
      busPending = pending;
      if (latest) this.update(latest);
    },
    serviceHost,
    updateService(active: boolean, pending: boolean, unique = false) {
      uniqueActive = active && unique;
      serviceActive = active;
      servicePending = pending;
      if (latest) this.update(latest);
    },
    waterHost,
    updateWater(active: boolean, pending: boolean) {
      waterActive = active;
      waterPending = pending;
      if (latest) this.update(latest);
    },
    powerHost,
    updatePower(active: boolean, pending: boolean) {
      powerActive = active;
      powerPending = pending;
      if (latest) this.update(latest);
    },
    zoneHost,
    bulldozeHost,
    growthHost,
    updateBulldoze(active: boolean, pending: boolean) {
      bulldozeActive = active;
      bulldozePending = pending;
      if (latest) this.update(latest);
    },
    updateZone(active: boolean, pending: boolean) {
      zoneActive = active;
      zonePending = pending;
      if (latest) this.update(latest);
    },
    update(state: Readonly<RoadToolState>) {
      latest = state;
      terraformHost.hidden = !terraformActive;
      terraform.setAttribute('aria-pressed', String(terraformActive));
      terraform.disabled = !state.ready || state.pending || terraformPending;
      districtHost.hidden = !districtActive;
      district.setAttribute('aria-pressed', String(districtActive));
      policy.disabled = district.disabled =
        !state.ready ||
        state.pending ||
        terraformPending ||
        districtPending ||
        tramPending ||
        metroPending ||
        busPending ||
        servicePending ||
        powerPending ||
        waterPending ||
        bulldozePending ||
        zonePending;
      tramHost.hidden = !tramActive;
      tram.setAttribute('aria-pressed', String(tramActive));
      tram.disabled =
        state.pending ||
        servicePending ||
        powerPending ||
        waterPending ||
        bulldozePending ||
        zonePending ||
        busPending ||
        metroPending ||
        terraformPending ||
        districtPending ||
        tramPending ||
        !state.ready;
      metroHost.hidden = !metroActive || tramActive;
      metro.setAttribute('aria-pressed', String(metroActive));
      metro.disabled =
        state.pending ||
        servicePending ||
        powerPending ||
        waterPending ||
        bulldozePending ||
        zonePending ||
        busPending ||
        metroPending ||
        terraformPending ||
        districtPending ||
        tramPending ||
        !state.ready;
      busHost.hidden = !busActive || metroActive || tramActive;
      bus.setAttribute('aria-pressed', String(busActive));
      bus.disabled =
        state.pending ||
        servicePending ||
        powerPending ||
        waterPending ||
        bulldozePending ||
        zonePending ||
        busPending ||
        metroPending ||
        terraformPending ||
        districtPending ||
        tramPending ||
        !state.ready;
      details.hidden =
        zoneActive ||
        bulldozeActive ||
        powerActive ||
        waterActive ||
        serviceActive ||
        busActive ||
        metroActive ||
        tramActive ||
        districtActive ||
        terraformActive;
      serviceHost.hidden = !serviceActive;
      service.setAttribute(
        'aria-pressed',
        String(serviceActive && !uniqueActive),
      );
      unique.setAttribute('aria-pressed', String(uniqueActive));
      service.disabled =
        !state.ready ||
        state.pending ||
        zonePending ||
        bulldozePending ||
        powerPending ||
        waterPending ||
        servicePending ||
        busPending ||
        metroPending ||
        tramPending ||
        terraformPending ||
        districtPending;
      unique.disabled = service.disabled;
      waterHost.hidden = !waterActive;
      water.setAttribute('aria-pressed', String(waterActive));
      water.disabled =
        !state.ready ||
        state.pending ||
        zonePending ||
        bulldozePending ||
        powerPending ||
        waterPending ||
        servicePending ||
        busPending ||
        metroPending ||
        tramPending ||
        terraformPending ||
        districtPending;
      powerHost.hidden = !powerActive;
      growthHost.hidden =
        powerActive ||
        waterActive ||
        serviceActive ||
        busActive ||
        metroActive ||
        tramActive ||
        districtActive ||
        terraformActive;
      power.setAttribute('aria-pressed', String(powerActive));
      power.disabled =
        !state.ready ||
        state.pending ||
        zonePending ||
        bulldozePending ||
        powerPending ||
        waterPending ||
        servicePending ||
        busPending ||
        metroPending ||
        tramPending ||
        terraformPending ||
        districtPending;
      bulldozeHost.hidden = !bulldozeActive;
      bulldoze.setAttribute('aria-pressed', String(bulldozeActive));
      bulldoze.disabled =
        !state.ready ||
        state.pending ||
        zonePending ||
        bulldozePending ||
        powerPending ||
        waterPending ||
        servicePending ||
        busPending ||
        metroPending ||
        tramPending ||
        terraformPending ||
        districtPending;
      zoneHost.hidden = !zoneActive;
      title.textContent = t(
        terraformActive
          ? 'terraform.tab'
          : districtActive
            ? 'district.tab'
            : tramActive
              ? 'tram.tab'
              : metroActive
                ? 'metro.tab'
                : busActive
                  ? 'bus.title'
                  : serviceActive
                    ? 'service.title'
                    : waterActive
                      ? 'water.title'
                      : powerActive
                        ? 'power.title'
                        : bulldozeActive
                          ? 'bulldoze.title'
                          : zoneActive
                            ? 'zone.title'
                            : 'road.title',
      );
      zones.setAttribute('aria-pressed', String(zoneActive));
      zones.disabled =
        !state.ready ||
        state.pending ||
        zonePending ||
        bulldozePending ||
        powerPending ||
        waterPending ||
        servicePending ||
        busPending ||
        metroPending ||
        tramPending ||
        terraformPending ||
        districtPending;
      for (const { button, lock, unlock } of featureLocks) {
        const locked = !state.unlocked.includes(unlock);
        button.disabled ||= locked;
        button.dataset.locked = String(locked);
        lock.hidden = !locked;
        button.title = locked ? unlockHint(unlock) : '';
      }
      panel.dataset.ready = String(state.ready);
      panel.dataset.phase = state.phase;
      panel.dataset.mode = state.mode;
      panel.dataset.elevation = String(state.elevation);
      heightRow.hidden =
        !state.active || state.mode === 'upgrade' || state.mode === 'junction';
      junctionRow.hidden = !state.active || state.mode !== 'junction';
      typeLabel.hidden = angleLabel.hidden = state.mode === 'junction';
      controlSelect.value = state.junctionControl;
      ban.checked = state.banLeft;
      controlSelect.disabled = ban.disabled =
        state.pending || state.junctionId === null;
      panel.dataset.junction = String(state.junctionId ?? '');
      panel.dataset.junctionControl = state.junctionControl;
      panel.dataset.banLeft = String(state.banLeft);
      for (const option of roadMode.options)
        if (option.value === 'junction')
          option.disabled = !state.unlocked.includes(INTERSECTIONS.unlock);
      lower.disabled = state.pending || state.elevation <= 0;
      raise.disabled =
        state.pending || state.elevation >= ROAD_RULES.maxElevationM;
      heightLabel.textContent = `${t('road.elevation')} ${state.elevation} m`;
      panel.dataset.demolitions = String(state.demolitions);
      roadMode.value = state.mode;
      roadMode.disabled = state.pending;
      panel.dataset.pending = String(state.pending);
      panel.dataset.money = String(state.money);
      money.dataset.negative = String(state.money < 0);
      panel.dataset.segments = String(state.segments);
      panel.dataset.valid = String(Boolean(state.preview?.canBuild));
      panel.dataset.active = String(state.active);
      enter.disabled = !state.ready || state.pending;
      money.textContent = `${t('road.money')} $${format.format(state.money)}`;
      draw.setAttribute('aria-pressed', String(state.active));
      explore.setAttribute(
        'aria-pressed',
        String(
          !state.active &&
            !zoneActive &&
            !bulldozeActive &&
            !powerActive &&
            !waterActive &&
            !serviceActive &&
            !busActive &&
            !metroActive &&
            !tramActive &&
            !districtActive &&
            !terraformActive,
        ),
      );
      panel.dataset.exploring = explore.getAttribute('aria-pressed') ?? 'false';
      draw.disabled =
        !state.ready ||
        state.pending ||
        zonePending ||
        bulldozePending ||
        powerPending ||
        waterPending ||
        servicePending ||
        busPending ||
        metroPending ||
        tramPending ||
        terraformPending ||
        districtPending;
      explore.disabled = demo.disabled =
        state.pending ||
        zonePending ||
        bulldozePending ||
        powerPending ||
        waterPending ||
        servicePending ||
        busPending ||
        metroPending ||
        tramPending ||
        terraformPending ||
        districtPending;
      terraform.disabled = explore.disabled || !state.ready;
      options.hidden = !state.active;
      catalog.host.hidden = !state.active || state.mode === 'junction';
      select.disabled = state.pending;
      angle.disabled = state.pending;
      select.value = state.type;
      angle.checked = state.angleSnap;
      for (const option of select.options) {
        const type = option.value as RoadTypeId;
        option.disabled = !state.unlocked.includes(ROADS[type].unlock);
        option.textContent =
          t(`road.${type}`) + (option.disabled ? ` · ${t('road.locked')}` : '');
      }
      catalog.update();
      confirm.disabled =
        !state.ready ||
        state.pending ||
        (state.mode === 'junction'
          ? state.junctionId === null
          : !state.preview?.canBuild);
      confirm.hidden =
        !state.active ||
        (state.mode === 'junction'
          ? state.junctionId === null
          : !state.preview);
      cancel.disabled = state.pending;
      cancel.hidden = !state.active || state.phase === 'start';
      confirm.textContent = t(
        state.mode === 'junction' ? 'road.applyJunction' : 'road.confirm',
      );
      const p = state.preview?.preview;
      metrics.textContent = p
        ? `${t('road.length')} ${p.length.toFixed(0)} m · ${t('road.cost')} $${format.format(p.cost)} · ${t('road.slope')} ${(p.slope * 100).toFixed(1)}%`
        : `${t('road.count')} ${state.segments}`;
      if (state.mode === 'upgrade' && state.upgradeCount)
        metrics.textContent += ` · ${t('road.upgradeCount')} ${state.upgradeCount} · ${t('road.demolitions')} ${state.demolitions}`;
      panel.dataset.cost = String(p?.cost ?? 0);
      const reason = state.reason ?? state.preview?.reason;
      status.dataset.invalid = String(Boolean(reason));
      status.textContent = state.pending
        ? t('road.pending')
        : reason
          ? t(reason)
          : !state.ready
            ? t('sim.loading')
            : !state.active
              ? t('road.exploreHint')
              : state.mode === 'junction'
                ? t('road.junctionHint')
                : state.mode === 'upgrade'
                  ? t('road.upgradeHint')
                  : state.mode === 'free'
                    ? t('road.freeHint')
                    : state.phase === 'control'
                      ? t('road.control')
                      : state.phase === 'start'
                        ? t('road.start')
                        : state.phase === 'end'
                          ? t('road.end')
                          : t('road.confirmHint');
      if (!construction) body.hidden = true;
    },
    dispose() {
      window.removeEventListener('keydown', shortcut);
      stopSignal();
      stopLayout();
      panel.remove();
    },
  };
}
