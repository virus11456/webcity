import { DEMAND } from '../../data/simulation';
import { ZONE_PALETTE } from '../../data/palette';
import type { CityStats } from '../../world/types';
import { t } from '../i18n/t';
const colors = {
  R: ZONE_PALETTE.RL.normal,
  C: ZONE_PALETTE.CL.normal,
  I: ZONE_PALETTE.I.normal,
  O: ZONE_PALETTE.O.normal,
};

/** Labelled RCIO meters expose exact demand values without relying on color alone. */
export function DemandBars({
  demand,
}: {
  demand: CityStats['demand'] | undefined;
}) {
  return (
    <div
      class="hud-demand"
      aria-label={t('hud.demand')}
      data-tooltip={t('help.demand')}
      tabIndex={0}
    >
      {(['R', 'C', 'I', 'O'] as const).map((zone) => (
        <div key={zone} class="hud-demand-item">
          <span>{zone}</span>
          <div
            class="hud-demand-track"
            role="meter"
            aria-label={t(`hud.demand${zone}`)}
            aria-valuemin={DEMAND.range[0]}
            aria-valuemax={DEMAND.range[1]}
            aria-valuenow={demand?.[zone] ?? 0}
            aria-valuetext={
              demand ? `${Math.round(demand[zone])}%` : t('sim.loading')
            }
          >
            <i
              style={{
                width: `${demand?.[zone] ?? 0}%`,
                background: colors[zone],
              }}
            />
          </div>
          <span>{demand ? Math.round(demand[zone]) : '—'}</span>
        </div>
      ))}
    </div>
  );
}
