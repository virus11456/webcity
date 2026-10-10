import { useLayoutEffect, useState } from 'preact/hooks';
import { layout, observeLayout } from '../store';
import { Button } from '../components/Button';
import { BottomSheet } from '../components/BottomSheet';
import { IconSprite } from '../components/Icon';
import { t } from '../i18n/t';
import { SpeedControls } from './SpeedControls';
import { DemandBars } from './DemandBars';
import type { TopBarModel } from './topBarModel';
import type { CityStats } from '../../world/types';
import '../styles/ui-kit.css';
import '../styles/topbar.css';

const integer = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat('zh-TW', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat('zh-TW', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const money = (value: number, short = false) =>
  `${value < 0 ? '−' : ''}$${(short ? compact : currency).format(Math.abs(value))}`;
const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${integer.format(Math.abs(value))}`;
function CityDetails({ stats }: { stats: CityStats | undefined }) {
  const net = stats ? stats.income - stats.expenses : 0;
  const migration = stats?.populationDetails
    ? stats.populationDetails.movedIn - stats.populationDetails.movedOut
    : 0;
  return (
    <div class="hud-details">
      <dl class="hud-metrics">
        <div>
          <dt>{t('hud.population')}</dt>
          <dd data-field="population">
            {stats ? integer.format(stats.population) : '—'}
          </dd>
          <small>
            {t('hud.migration')}{' '}
            <span data-field="migration" data-negative={migration < 0}>
              {signed(migration)}
            </span>
          </small>
        </div>
        <div>
          <dt>{t('hud.money')}</dt>
          <dd
            data-field="money"
            data-negative={stats ? stats.money < 0 : false}
          >
            {stats ? money(stats.money) : '—'}
          </dd>
          <small>
            {t('hud.weekly')}{' '}
            <span data-field="weekly" data-negative={net < 0}>
              {net > 0 ? '+' : ''}
              {stats ? money(net) : '—'}
            </span>
          </small>
        </div>
        <div>
          <dt>{t('hud.happiness')}</dt>
          <dd data-field="happiness">
            {stats ? `${Math.round(stats.happiness)}%` : '—'}
          </dd>
        </div>
      </dl>
      <DemandBars demand={stats?.demand} />
    </div>
  );
}

/** Responsive city HUD with a single-line phone summary and live detail sheet. */
export function TopBar({ model }: { model: TopBarModel }) {
  useLayoutEffect(observeLayout, []);
  const [expanded, setExpanded] = useState(false);
  const mode = layout.value;
  const isCompact = mode === 'phone-portrait' || mode === 'phone-landscape';
  const stats = model.stats.value;
  const cityName = model.cityName.value || t('city.name');
  useLayoutEffect(() => {
    if (!isCompact) setExpanded(false);
  }, [isCompact]);
  return (
    <header
      class="topbar"
      data-layout={mode}
      data-stats-day={stats?.day}
      data-money={stats?.money}
      data-population={stats?.population}
    >
      <IconSprite />
      <div class="topbar-summary">
        <div class="hud-brand" title={cityName}>
          <h1>{t('app.name')}</h1>
          <span class="hud-city-name">{cityName}</span>
        </div>
        {isCompact ? (
          <>
            <div class="hud-compact-stat">
              <span>{t('hud.population')}</span>
              <strong>{stats ? compact.format(stats.population) : '—'}</strong>
            </div>
            <div
              class="hud-compact-stat"
              data-negative={stats ? stats.money < 0 : false}
            >
              <span>{t('hud.money')}</span>
              <strong>{stats ? money(stats.money, true) : '—'}</strong>
            </div>
            <Button
              class="hud-expand"
              aria-label={t('hud.expand')}
              aria-expanded={expanded}
              onClick={() => setExpanded(true)}
            >
              {t('hud.details')}
            </Button>
          </>
        ) : (
          <CityDetails stats={stats} />
        )}
      </div>
      <SpeedControls model={model} />
      {model.failed.value && (
        <p class="hud-error" role="alert">
          {t('sim.failed')}
        </p>
      )}
      {isCompact && (
        <BottomSheet
          open={expanded}
          title={`${cityName} · ${t('hud.details')}`}
          onDismiss={() => setExpanded(false)}
        >
          <CityDetails stats={stats} />
          <p class="hud-detail-note">{t('hud.weeklyHint')}</p>
        </BottomSheet>
      )}
    </header>
  );
}
