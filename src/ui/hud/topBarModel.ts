import { batch } from '@preact/signals';
import type { SimClient } from '../../bridge/simClient';
import type { SimSpeed } from '../../data/config';
import { createCityHudState } from '../store';

/** Event-fed HUD model; fast clock updates never clone the world or daily stats. */
export function createTopBarModel(client: SimClient) {
  const { stats, clock, cityName, failed, gameOver } = createCityHudState();
  stats.value = client.mirror.readStats();
  clock.value = client.mirror.clock;
  cityName.value = client.mirror.cityName ?? '';
  gameOver.value = client.mirror.gameOver;
  let disposed = false;
  const showError = () => {
    if (!disposed) failed.value = true;
  };
  const unsubscribe = client.onEvent((event) => {
    if (event.t === 'error') {
      showError();
      return;
    }
    if (event.t === 'clock') {
      clock.value = client.mirror.clock;
      return;
    }
    if (!['ready', 'stats', 'fundsChanged', 'economy'].includes(event.t))
      return;
    batch(() => {
      stats.value = client.mirror.readStats();
      gameOver.value = client.mirror.gameOver;
      if (event.t === 'ready') {
        cityName.value = client.mirror.cityName ?? '';
        clock.value = client.mirror.clock;
        failed.value = false;
      }
    });
  });
  return {
    stats,
    clock,
    cityName,
    failed,
    gameOver,
    showError,
    async setSpeed(speed: SimSpeed) {
      if (disposed || failed.value || gameOver.value || !clock.value) return;
      try {
        const response = await client.send({ t: 'setSpeed', speed });
        if (response.t === 'result' && !response.ok) showError();
      } catch {
        showError();
      }
    },
    dispose() {
      disposed = true;
      unsubscribe();
    },
  };
}
export type TopBarModel = ReturnType<typeof createTopBarModel>;
