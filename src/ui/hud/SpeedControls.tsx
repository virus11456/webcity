import { Icon } from '../components/Icon';
import { dateForDay } from '../../world/calendar';
import { TIME } from '../../data/config';
import { Button } from '../components/Button';
import { t } from '../i18n/t';
import type { TopBarModel } from './topBarModel';

/** Show only worker-acknowledged time and speed, including pause and terminal states. */
export function SpeedControls({ model }: { model: TopBarModel }) {
  const clock = model.clock.value;
  const failed = model.failed.value;
  const ended = model.gameOver.value;
  const iso = clock ? dateForDay(clock.day) : undefined;
  const status = t(
    failed
      ? 'sim.failed'
      : ended
        ? 'finance.gameOver'
        : !clock
          ? 'sim.loading'
          : clock.speed === 0
            ? 'sim.paused'
            : 'sim.running',
  );
  return (
    <section
      class="sim-controls"
      aria-label={t('sim.title')}
      data-ready={Boolean(clock) && !failed}
      data-ticks={clock?.ticks}
      data-day={clock?.day}
      data-speed={clock?.speed}
    >
      <div class="sim-calendar">
        <time class="sim-date" dateTime={iso} aria-label={t('sim.date')}>
          {iso?.replaceAll('-', '/') ?? t('sim.loading')}
        </time>
        <span class="sim-week">
          {clock
            ? `${t('sim.weekPrefix')}${Math.floor(clock.day / TIME.fiscalPeriodDays) + 1}${t('sim.weekSuffix')} · ${(clock.day % TIME.fiscalPeriodDays) + 1}/${TIME.fiscalPeriodDays}`
            : ''}
        </span>
        <span class="hud-status" role="status">
          {status}
        </span>
      </div>
      <div class="sim-speeds">
        {([0, 1, 2, 4] as const).map((speed) => (
          <Button
            key={speed}
            aria-label={t(speed === 0 ? 'sim.pause' : `sim.speed${speed}`)}
            disabled={!clock || failed || ended}
            aria-pressed={clock?.speed === speed}
            onClick={() => void model.setSpeed(speed)}
          >
            <Icon
              name={speed === 0 ? 'pause' : speed === 1 ? 'play' : 'fast'}
            />
            <span class="speed-label">
              {t(speed === 0 ? 'sim.pause' : `sim.speed${speed}`)}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
