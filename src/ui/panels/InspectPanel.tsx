import { rebuildCost } from '../../world/disasters';
import { uniqueDefinition } from '../../world/unique';
import { deathcareCapacity } from '../../world/deathcare';
import { Icon } from '../components/Icon';
import { PROBLEM_ICONS } from '../../data/icons';
import type { Building } from '../../world/types';
import { ROADS } from '../../data/roads';
import {
  BUILDING_PROBLEMS,
  hasBuildingProblem,
} from '../../world/buildingProblems';
import { garbageCapacity } from '../../world/garbage';
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
  follow,
  toggle,
  pending,
  failure,
  thumbnail,
  rebuild,
  sandbox,
}: {
  rebuild?: (id: number) => void;
  sandbox?: boolean;
  info: InspectInfo;
  thumbnail?: string;
  locate?: (p: Vec2) => void;
  follow?: (id: number) => void;
  toggle?: (id: number, enabled: boolean) => void;
  pending: boolean;
  failure: string | null;
}) {
  if (info.kind === 'vehicle') {
    const v = info.value;
    const mission = v.citizenId < 0;
    const fire = v.purpose === 7;
    const deathcare = v.purpose === 10;
    const garbage = v.purpose === 9;
    const collection = deathcare ? v.deathcare : v.garbage;
    const labels = deathcare ? 'deathcare' : 'garbage';
    const rows: [string, string | number][] =
      v.purpose === 8
        ? [
            [t('bus.line'), v.bus?.line ?? v.destinationId],
            [t('bus.onboard'), v.bus?.passengers ?? 0],
            [t('vehicle.speed'), `${(v.speed * 3.6).toFixed(0)} km/h`],
          ]
        : garbage || deathcare
          ? [
              [t(`${labels}.depot`), collection?.depot ?? 0],
              [t(`${labels}.load`), collection?.units.toFixed(1) ?? 0],
              [
                t('vehicle.purpose'),
                t(
                  collection?.phase === 'return'
                    ? `${labels}.return`
                    : `${labels}.collect`,
                ),
              ],
              [t('vehicle.destination'), v.destinationId],
              [t('vehicle.speed'), `${(v.speed * 3.6).toFixed(0)} km/h`],
            ]
          : fire
            ? [
                [t('fire.station'), v.originId ?? 0],
                [t('vehicle.destination'), v.destinationId],
                [t('vehicle.purpose'), t('fire.responding')],
                [t('vehicle.speed'), `${(v.speed * 3.6).toFixed(0)} km/h`],
              ]
            : mission
              ? [
                  [t('cargo.origin'), v.originId || t('cargo.outside')],
                  [
                    t('vehicle.destination'),
                    v.destinationId || t('cargo.outside'),
                  ],
                  [t('cargo.units'), v.cargo?.units.toFixed(0) ?? 0],
                  [
                    t('vehicle.purpose'),
                    t(`cargo.${v.cargo?.kind ?? 'local'}`),
                  ],
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
            v.purpose === 8
              ? v.kind === 2 || v.kind === 9 || v.kind === 10
                ? v.kind === 9
                  ? 'metro.tab'
                  : v.kind === 10
                    ? 'tram.tab'
                    : 'bus.vehicle'
                : 'bus.walker'
              : garbage || deathcare
                ? `${labels}.truck`
                : fire
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
          {follow && (
            <Button onClick={() => follow(v.id)}>{t('follow.start')}</Button>
          )}
          {mission && v.originPos && (
            <Button onClick={() => locate?.(v.originPos!)}>
              {t(
                garbage || deathcare
                  ? `${labels}.locateOrigin`
                  : fire
                    ? 'fire.locateStation'
                    : 'cargo.locateOrigin',
              )}
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
    if (b.kind !== 'park')
      rows.push(
        [t('inspect.jobs'), `${b.workers} / ${b.jobs}`],
        [
          t('inspect.utilities'),
          [1, 2, 4]
            .map((flag) => t(b.flags & flag ? 'inspect.yes' : 'inspect.no'))
            .join(' / '),
        ],
      );
    if (
      ((b.kind === 'park' || b.kind === 'unique') && b.defId !== 'tree') ||
      b.wasteFacility ||
      b.mortuary
    )
      rows.push([
        t('service.status'),
        t(
          b.state !== 'active'
            ? `inspect.${b.state}`
            : b.fire?.burning
              ? 'fire.burning'
              : b.enabled === false
                ? 'service.off'
                : 'service.on',
        ),
      ]);
    if (b.serviceStatus) {
      const q = b.serviceStatus;
      rows.push(
        [
          t('service.status'),
          t(
            b.state !== 'active'
              ? `inspect.${b.state}`
              : b.fire?.burning
                ? 'fire.burning'
                : b.enabled === false
                  ? 'service.off'
                  : 'service.on',
          ),
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
    if (b.happiness !== undefined)
      rows.push([t('hud.happiness'), `${b.happiness.toFixed(1)}%`]);
    if (b.upgrade) {
      const q = b.upgrade;
      rows.push([
        t('level.target'),
        q.target === b.level ? t('level.max') : `Lv${q.target}`,
      ]);
      if (q.target > b.level)
        rows.push(
          [t('level.progress'), `${Math.round(q.progress * 100)}%`],
          [
            t('level.land'),
            `${(b.landValue ?? 0).toFixed(1)} / ${q.landRequired}`,
          ],
          [
            t('level.education'),
            `${q.education.toFixed(2)} / ${q.educationRequired}`,
          ],
          [t('level.utilities'), t(q.utilities ? 'inspect.yes' : 'inspect.no')],
        );
    }
    if (b.environment) {
      rows.push(
        [t('environment.pollution'), b.environment.pollution.toFixed(1)],
        [t('environment.noise'), b.environment.noise.toFixed(1)],
      );
      if (b.defId.startsWith('water_'))
        rows.push([
          t('environment.waterPollution'),
          b.environment.waterPollution.toFixed(1),
        ]);
    }
    if (b.kind === 'zoned')
      rows.push([
        t('environment.drinkingWater'),
        `${(b.drinkingWaterPollution ?? 0).toFixed(1)}%`,
      ]);
    if (b.sewageDischarge)
      rows.push([
        t('environment.discharge'),
        `${b.sewageDischarge.toFixed(0)} m³ / ${t('environment.week')}`,
      ]);
    const unique = uniqueDefinition(b.defId);
    if (unique)
      rows.push([
        t('unique.effect'),
        `+${unique.landValueBonus} · ${unique.radiusM} m`,
      ]);
    if (b.landValue !== undefined)
      rows.push([t('park.landValue'), b.landValue.toFixed(1)]);
    if (b.parkBonus !== undefined)
      rows.push([t('park.bonus'), `+${b.parkBonus.toFixed(1)}`]);
    if (b.education) {
      rows.push([
        t(
          b.education.capacity === undefined
            ? 'education.homeStudents'
            : 'education.schoolStudents',
        ),
        `${b.education.enrolled} / ${b.education.capacity ?? b.education.eligible}`,
      ]);
      if (b.housing)
        rows.push([
          t('education.average'),
          b.housing.averageEducation.toFixed(2),
        ]);
    }
    if (b.health?.residents)
      rows.push(
        [t('health.average'), `${b.health.average.toFixed(1)}%`],
        [t('health.sick'), `${b.health.sick} / ${b.health.residents}`],
      );
    if (b.state === 'burned')
      rows.push([
        t('disaster.rebuildCost'),
        `$${sandbox ? 0 : rebuildCost(b)}`,
      ]);
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
    if (b.bodies) rows.push([t('deathcare.pending'), b.bodies.pending]);
    if (b.mortuary)
      rows.push(
        [
          t(b.defId === 'cemetery' ? 'deathcare.graves' : 'deathcare.waiting'),
          `${b.mortuary.stock} / ${deathcareCapacity(b)}`,
        ],
        [t('deathcare.processed'), b.mortuary.processedToday],
        [t('deathcare.trucks'), b.mortuary.vehicles],
        [t('deathcare.routeHint'), b.mortuary.full ? t('deathcare.full') : ''],
      );
    if (b.garbage)
      rows.push(
        [t('garbage.stock'), b.garbage.stock.toFixed(1)],
        [t('garbage.rate'), b.garbage.generated.toFixed(1)],
      );
    if (b.wasteFacility)
      rows.push(
        [
          t('garbage.storage'),
          `${b.wasteFacility.stock.toFixed(1)} / ${garbageCapacity(b)}`,
        ],
        [t('garbage.processed'), b.wasteFacility.processedToday.toFixed(1)],
        [t('garbage.trucks'), String(b.wasteFacility.vehicles)],
        [t('garbage.routeHint'), b.wasteFacility.full ? t('garbage.full') : ''],
      );
    if (b.industry)
      rows.push([t('industry.product'), t(`industry.${b.industry}`)]);
    if (b.cargo)
      rows.push([
        t(b.industry ? 'industry.rawStock' : 'cargo.stock'),
        `${b.cargo.stock.toFixed(0)} / ${b.cargo.capacity.toFixed(0)}`,
      ]);
    const problems = [...Object.keys(PROBLEMS), 'deathcare'].filter(
      (key) =>
        (b.problemTimers[key as keyof typeof PROBLEMS] ?? 0) > 0 ||
        ((key === 'crime' ||
          key === 'fire' ||
          key === 'sickness' ||
          key === 'garbage' ||
          key === 'deathcare') &&
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
    const q = info.value.traffic;
    rows.push([t('traffic.limit'), `${ROADS[info.value.type].speedKph} km/h`]);
    if (q)
      rows.push(
        [t('traffic.count'), q.count],
        [
          t('traffic.average'),
          q.count ? `${q.speedKmh.toFixed(1)} km/h` : t('traffic.empty'),
        ],
        [t('traffic.flow'), `${(q.ratio * 100).toFixed(0)}%`],
      );
  }
  rows.push([t('inspect.paid'), `$${v.paidCost ?? 0}`]);
  return (
    <div class="inspect-data" data-kind={info.kind} data-id={v.id}>
      {thumbnail && (
        <img
          class="inspect-thumbnail"
          src={thumbnail}
          alt={name}
          width="256"
          height="160"
        />
      )}
      <strong>{name}</strong>
      {info.kind === 'building' && (
        <div class="inspect-problem-icons">
          {BUILDING_PROBLEMS.filter((key) =>
            hasBuildingProblem(info.value as Building, key),
          ).map((key) => (
            <span key={key}>
              <Icon name={PROBLEM_ICONS[key]!} />
              {t(`problem.${key as keyof typeof PROBLEMS}`)}
            </span>
          ))}
        </div>
      )}
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {info.kind === 'building' &&
        info.value.upgrade &&
        info.value.upgrade.target > info.value.level && (
          <progress
            aria-label={t('level.progress')}
            value={info.value.upgrade.progress}
            max={1}
          />
        )}
      {info.kind === 'building' && info.value.state === 'burned' && (
        <div>
          <p>{t('disaster.rebuildHint')}</p>
          <Button
            disabled={pending || info.value.rezoneAtTick !== undefined}
            onClick={() => rebuild?.(info.value.id)}
          >
            {t('disaster.rebuild')}
          </Button>
        </div>
      )}
      {failure && <p role="alert">{failure}</p>}
      {info.kind === 'building' &&
        info.value.defId !== 'tree' &&
        serviceDefinition(info.value.defId) && (
          <Button
            disabled={pending}
            onClick={() =>
              toggle?.(info.value.id, info.value.enabled === false)
            }
          >
            {t(
              info.value.enabled === false
                ? 'service.enable'
                : 'service.disable',
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
  follow?: (id: number) => void,
  thumbnail?: (building: Building) => string | undefined,
  rebuild?: (id: number) => Promise<Parameters<typeof t>[0] | null>,
  sandbox = false,
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
        thumbnail={
          current.kind === 'building' ? thumbnail?.(current.value) : undefined
        }
        locate={locate}
        follow={follow}
        sandbox={sandbox}
        rebuild={async (id) => {
          if (pending || !rebuild) return;
          pending = true;
          failure = null;
          paint();
          try {
            const key = await rebuild(id);
            if (key) failure = t(key);
          } catch {
            failure = t('sim.failed');
          } finally {
            pending = false;
            paint();
          }
        }}
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
