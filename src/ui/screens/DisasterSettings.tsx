import { useEffect, useState } from 'preact/hooks';
import type { SimClient } from '../../bridge/simClient';
import { emptyDisasters } from '../../world/disasters';
import { t } from '../i18n/t';
export function DisasterSettings({ client }: { client: SimClient }) {
  const [state, setState] = useState(
    () => client.mirror.readDisasters() ?? emptyDisasters(),
  );
  const [requested, setRequested] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false),
    [failure, setFailure] = useState('');
  useEffect(
    () =>
      client.onEvent((e) => {
        if (e.t === 'disasters') setState(e.state);
      }),
    [client],
  );
  async function toggle(enabled: boolean) {
    if (pending) return;
    setRequested(enabled);
    setPending(true);
    setFailure('');
    try {
      const r = await client.send({ t: 'setDisasters', enabled });
      if (r.t !== 'result' || !r.ok) setFailure(t('menu.actionFailed'));
    } catch {
      setFailure(t('sim.failed'));
    } finally {
      setRequested(null);
      setPending(false);
    }
  }
  return (
    <section class="menu-settings disaster-settings">
      <label class="menu-check">
        <input
          type="checkbox"
          checked={requested ?? state.enabled}
          disabled={pending}
          onChange={(e) => void toggle(e.currentTarget.checked)}
        />
        {t('disaster.enable')}
      </label>
      <p>{t('disaster.hint')}</p>
      <p role="status">
        {state.warning
          ? `${t('disaster.warning')} ${state.warning.dueDay} ${t('disaster.day')}`
          : t('disaster.clear')}
      </p>
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
