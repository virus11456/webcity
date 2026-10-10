import { hasBuildingProblem } from '../../world/buildingProblems';
import { serviceDefinition } from '../../world/services';
import type { ServiceId } from '../../data/services';
import { render } from 'preact';
import { BUILDINGS } from '../../data/buildings';
import { ZONES, type ZoneType } from '../../data/zones';
import { PROBLEMS } from '../../data/simulation';
import type { InspectInfo } from '../../world/snapshot';
import { layout, observeLayout } from '../store';
import { Button } from '../components/Button';
import type { Vec2 } from '../../world/types';
import { Panel } from '../components/Panel';
import { BottomSheet } from '../components/BottomSheet';
import { t } from '../i18n/t';
import '../styles/inspect.css';

function Content({
  info,
  locate,
  toggle,
  pending,
  failure,
}: {
  info: InspectInfo;
  locate?: (p: Vec2) => void;
  toggle?: (id: number, enabled: boolean) => void;
  pending: boolean;
  failure: string | null;
}) {
  if (info.kind === 'vehicle') {
    const v = info.value;
    const mission = v.citizenId < 0;
    const fire = v.purpose === 7;
    const rows: [string, string | number][] = fire
      ? [
          [t('fire.station'), v.originId ?? 0],
          [t('vehicle.destination'), v.destinationId],
          [t('vehicle.purpose'), t('fire.responding')],
          [t('vehicle.speed'), `${(v.speed * 3.6).toFixed(0)} km/h`],
        ]
      : mission
        ? [
            [t('cargo.origin'), v.originId || t('cargo.outside')],
            [t('vehicle.destination'), v.destinationId || t('cargo.outside')],
            [t('cargo.units'), v.cargo?.units.toFixed(0) ?? 0],
            [t('vehicle.purpose'), t(`cargo.${v.cargo?.kind ?? 'local'}`)],
            [t('vehicle.speed'), `${(v.speed * 3.6).toFixed(0)} km/h`],
          ]
        : [
            [t('vehicle.citizen'), v.citizenId],
            [t('vehicle.home'), v.homeId],
            [t('vehicle.work'), v.workId || t('inspect.none')],
            [t('vehicle.destination'), v.destinationId],
            [
              t('vehicle.purpose'),
              t(`vehicle.purpose${v.purpose as 1 | 2 | 3 | 4 | 5}`),
            ],
            [t('vehicle.speed'), `${(v.speed * 3.6).toFixed(0)} km/h`],
          ];
    return (
      <div
        class="inspect-data"
        data-kind="vehicle"
        data-id={v.id}
        data-citizen={v.citizenId}
      >
        <strong>
          {t(
            fire
              ? 'fire.truck'
              : mission
                ? 'cargo.truck'
                : v.kind === 8
                  ? 'vehicle.pedestrian'
                  : 'vehicle.car',
          )}{' '}
          #{Math.abs(v.citizenId)}
        </strong>
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div class="inspect-locations">
          {mission && v.originPos && (
            <Button onClick={() => locate?.(v.originPos!)}>
              {t(fire ? 'fire.locateStation' : 'cargo.locateOrigin')}
            </Button>
          )}
          {v.homePos && (
            <Button onClick={() => locate?.(v.homePos!)}>
              {t('vehicle.locateHome')}
            </Button>
          )}
          {v.workPos && (
            <Button onClick={() => locate?.(v.workPos!)}>
              {t('vehicle.locateWork')}
            </Button>
          )}
          {v.destinationPos && (
            <Button onClick={() => locate?.(v.destinationPos!)}>
              {t('vehicle.locateDestination')}
            </Button>
          )}
        </div>
      </div>
    );
  }
  const v = info.value;
  const street = t(`inspect.street${(v.id % 4) as 0 | 1 | 2 | 3}`);
  const rows: [string, string | number][] = [
    [t('inspect.address'), `${street} ${v.id} ${t('inspect.number')}`],
  ];
  let name = t('inspect.title');
  if (info.kind === 'building') {
    const b = info.value;
    const definition = BUILDINGS.find((d) => d.id === b.defId);
    name = serviceDefinition(b.defId)
      ? t(`service.${b.defId as ServiceId}`)
      : b.defId in ZONES
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
      [t('inspect.crime'), `${(b.crime ?? 0).toFixed(1)}%`],
    );
    if (!serviceDefinition(b.defId))
      rows.push(
        [t('inspect.level'), b.level],
        [t('inspect.residents'), b.residents],
        [
          t('inspect.capacity'),
          `${b.housing?.occupied ?? 0} / ${b.households}`,
        ],
      );
    rows.push(
      [t('inspect.jobs'), `${b.workers} / ${b.jobs}`],
      [
        t('inspect.utilities'),
        [1, 2, 4]
          .map((flag) => t(b.flags & flag ? 'inspect.yes' : 'inspect.no'))
          .join(' / '),
      ],
    );
    if (b.serviceStatus) {
      const q = b.serviceStatus;
      rows.push(
        [
          t('service.status'),
          t(b.enabled === false ? 'service.off' : 'service.on'),
        ],
        [t('service.radius'), `${q.radius.toFixed(0)} m`],
        [
          t('service.capacity'),
          `${q.demand.toFixed(0)} / ${q.capacity.toFixed(0)}`,
        ],
        [t('service.efficiency'), `${Math.round(q.efficiency * 100)}%`],
        [t('service.connected'), t(q.connected ? 'inspect.yes' : 'inspect.no')],
      );
    }
    if (b.coverage && !b.serviceStatus)
      for (const [service, value] of Object.entries(b.coverage))
        rows.push([
          `${t(`finance.${service as keyof NonNullable<typeof b.coverage>}`)} ${t('service.coverage')}`,
          `${Math.round(value * 100)}%`,
        ]);
    if (b.health?.residents)
      rows.push(
        [t('health.average'), `${b.health.average.toFixed(1)}%`],
        [t('health.sick'), `${b.health.sick} / ${b.health.residents}`],
      );
    if (b.fire)
      rows.push(
        [
          t('fire.status'),
          t(
            b.fire.burning
              ? 'fire.burning'
              : b.state === 'burned'
                ? 'fire.burned'
                : 'fire.extinguished',
          ),
        ],
        [t('fire.damage'), `${Math.round(b.fire.damage * 100)}%`],
      );
    if (b.cargo)
      rows.push([
        t('cargo.stock'),
        `${b.cargo.stock.toFixed(0)} / ${b.cargo.capacity.toFixed(0)}`,
      ]);
    const problems = Object.keys(PROBLEMS).filter(
      (key) =>
        (b.problemTimers[key as keyof typeof PROBLEMS] ?? 0) > 0 ||
        ((key === 'crime' || key === 'fire' || key === 'sickness') &&
          hasBuildingProblem(b, key)),
    );
    rows.push([
      t('inspect.problems'),
      problems
        .map((key) =>
          t(
            key === 'noGoods' && b.defId === 'I'
              ? 'problem.noExport'
              : `problem.${key as keyof typeof PROBLEMS}`,
          ),
        )
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
      {failure && <p role="alert">{failure}</p>}
      {info.kind === 'building' && serviceDefinition(info.value.defId) && (
        <Button
          disabled={pending}
          onClick={() => toggle?.(info.value.id, info.value.enabled === false)}
        >
          {t(
            info.value.enabled === false ? 'service.enable' : 'service.disable',
          )}
        </Button>
      )}
    </div>
  );
}
/** Mount live details with authoritative service actions and a modal sheet on phones. */
export function createInspectPanel(
  parent: HTMLElement,
  dismiss: () => void,
  locate?: (p: Vec2) => void,
  toggle?: (id: number, enabled: boolean) => Promise<boolean>,
) {
  const host = document.createElement('div');
  host.className = 'inspect-host';
  parent.append(host);
  let current: InspectInfo | null = null;
  let pending = false;
  let failure: string | null = null;
  let disposed = false;
  const stop = observeLayout();
  const paint = () => {
    if (disposed) return;
    if (!current) {
      render(null, host);
      return;
    }
    const body = (
      <Content
        info={current}
        locate={locate}
        pending={pending}
        failure={failure}
        toggle={async (id, enabled) => {
          if (pending || !toggle) return;
          pending = true;
          failure = null;
          paint();
          try {
            if (!(await toggle(id, enabled))) failure = t('err.invalidCommand');
          } catch {
            failure = t('sim.failed');
          } finally {
            pending = false;
            paint();
          }
        }}
      />
    );
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
      if (info?.kind !== current?.kind || info?.value.id !== current?.value.id)
        failure = null;
      current = info;
      paint();
    },
    dispose() {
      disposed = true;
      off();
      stop();
      render(null, host);
      host.remove();
    },
  };
}
