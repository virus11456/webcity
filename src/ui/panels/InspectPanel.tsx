import { render } from 'preact';
import { BUILDINGS } from '../../data/buildings';
import { ZONES, type ZoneType } from '../../data/zones';
import { PROBLEMS } from '../../data/simulation';
import type { InspectInfo } from '../../world/snapshot';
import { layout, observeLayout } from '../store';
import { Panel } from '../components/Panel';
import { BottomSheet } from '../components/BottomSheet';
import { t } from '../i18n/t';
import '../styles/inspect.css';

function Content({ info }: { info: InspectInfo }) {
  const v = info.value;
  const street = t(`inspect.street${(v.id % 4) as 0 | 1 | 2 | 3}`);
  const rows: [string, string | number][] = [
    [t('inspect.address'), `${street} ${v.id} ${t('inspect.number')}`],
  ];
  let name = t('inspect.title');
  if (info.kind === 'building') {
    const b = info.value;
    const definition = BUILDINGS.find((d) => d.id === b.defId);
    name =
      b.defId in ZONES
        ? t(`zone.${b.defId as ZoneType}`)
        : b.defId.startsWith('power_')
          ? t(`power.${b.defId as 'power_wind' | 'power_coal'}`).split(
              ' · ',
            )[0]!
          : b.defId.startsWith('water_')
            ? t(
                `water.${b.defId as 'water_tower' | 'water_pump' | 'water_drain' | 'water_treatment'}`,
              ).split(' · ')[0]!
            : b.defId;
    rows.push(
      [t('inspect.state'), t(`inspect.${b.state}`)],
      [t('inspect.level'), b.level],
      [t('inspect.residents'), b.residents],
      [t('inspect.capacity'), `${b.housing?.occupied ?? 0} / ${b.households}`],
      [t('inspect.jobs'), `${b.workers} / ${b.jobs}`],
      [
        t('inspect.utilities'),
        [1, 2, 4]
          .map((flag) => t(b.flags & flag ? 'inspect.yes' : 'inspect.no'))
          .join(' / '),
      ],
    );
    const problems = Object.keys(PROBLEMS).filter(
      (key) => (b.problemTimers[key as keyof typeof PROBLEMS] ?? 0) > 0,
    );
    rows.push([
      t('inspect.problems'),
      problems
        .map((key) => t(`problem.${key as keyof typeof PROBLEMS}`))
        .join('、') || t('inspect.none'),
    ]);
    if (definition)
      rows.push([
        t('toolbar.upkeep'),
        `$${definition.upkeepPerWeek}${t('toolbar.perWeek')}`,
      ]);
  } else if (info.kind === 'segment') {
    name = t(`road.${info.value.type}`);
    rows.push([t('inspect.length'), `${info.value.length.toFixed(1)} m`]);
  }
  rows.push([t('inspect.paid'), `$${v.paidCost ?? 0}`]);
  return (
    <div class="inspect-data" data-kind={info.kind} data-id={v.id}>
      <strong>{name}</strong>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
/** Mount a live read-only inspector, switching to a modal sheet on phone layouts. */
export function createInspectPanel(parent: HTMLElement, dismiss: () => void) {
  const host = document.createElement('div');
  host.className = 'inspect-host';
  parent.append(host);
  let current: InspectInfo | null = null;
  const stop = observeLayout();
  const paint = () => {
    if (!current) {
      render(null, host);
      return;
    }
    const body = <Content info={current} />;
    render(
      layout.value.startsWith('phone') ? (
        <BottomSheet open title={t('inspect.title')} onDismiss={dismiss}>
          {body}
        </BottomSheet>
      ) : (
        <Panel title={t('inspect.title')} onClose={dismiss}>
          {body}
        </Panel>
      ),
      host,
    );
  };
  const off = layout.subscribe(paint);
  return {
    update(info: InspectInfo | null) {
      current = info;
      paint();
    },
    dispose() {
      off();
      stop();
      render(null, host);
      host.remove();
    },
  };
}
