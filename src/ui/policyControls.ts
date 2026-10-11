import { POLICIES, type PolicyId } from '../data/policies';
import { policyFee, garbageRate } from '../world/policies';
import type { SimClient } from '../bridge/simClient';
import { t } from './i18n/t';
export function createPolicyControls(parent: HTMLElement, sim: SimClient) {
  const dialog = document.createElement('dialog');
  dialog.className = 'finance-dialog policy-dialog';
  dialog.setAttribute('aria-label', t('policy.title'));
  const heading = document.createElement('h1');
  heading.textContent = t('policy.title');
  const close = document.createElement('button');
  close.textContent = t('policy.close');
  close.onclick = () => dialog.close();
  const scope = document.createElement('select');
  scope.setAttribute('aria-label', t('policy.scope'));
  const hint = document.createElement('p');
  hint.textContent = t('policy.hint');
  const summary = document.createElement('p');
  summary.className = 'policy-summary';
  const status = document.createElement('output');
  status.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'policy-list';
  dialog.append(heading, close, scope, hint, summary, status, list);
  parent.append(dialog);
  let pending = false,
    scopeKey = '';
  const rows: {
    id: PolicyId;
    input: HTMLSelectElement;
    inherited: HTMLElement;
  }[] = [];
  for (const p of POLICIES) {
    const row = document.createElement('section'),
      label = document.createElement('label'),
      strong = document.createElement('strong'),
      description = document.createElement('p'),
      input = document.createElement('select'),
      inherited = document.createElement('small');
    row.className = 'policy-row';
    strong.textContent = t(`policy.${p.id}`);
    input.setAttribute('aria-label', strong.textContent);
    label.append(strong, input);
    description.textContent = `${t(`policy.effect.${p.id}`)} · ${t('policy.fee')} $${p.costPerHouseholdWeek}`;
    row.append(label, description, inherited);
    list.append(row);
    rows.push({ id: p.id, input, inherited });
    input.onchange = () => void change(p.id, input.value);
  }
  function update() {
    const s = sim.mirror.readPolicies();
    if (!s) return;
    const key = JSON.stringify(s.districts.map((d) => [d.id, d.name]));
    if (key !== scopeKey) {
      scopeKey = key;
      const selected = scope.value;
      scope.replaceChildren(
        ...[{ id: 0, name: t('policy.city') }, ...s.districts].map((d) => {
          const o = document.createElement('option');
          o.value = String(d.id);
          o.textContent = d.name;
          return o;
        }),
      );
      scope.value = Array.from(scope.options).some((o) => o.value === selected)
        ? selected
        : '0';
    }
    const district = s.districts.find((d) => d.id === Number(scope.value));
    scope.disabled = pending;
    dialog.dataset.pending = String(pending);
    for (const { id, input, inherited } of rows) {
      const choices = district ? ['inherit', 'on', 'off'] : ['on', 'off'];
      if (input.options.length !== choices.length)
        input.replaceChildren(
          ...choices.map((value) => {
            const o = document.createElement('option');
            o.value = value;
            o.textContent = t(`policy.${value as 'on' | 'off' | 'inherit'}`);
            return o;
          }),
        );
      const local = district?.policies?.[id],
        city = s.policies.includes(id);
      input.value = district
        ? local === undefined
          ? 'inherit'
          : local
            ? 'on'
            : 'off'
        : city
          ? 'on'
          : 'off';
      input.disabled =
        pending ||
        (!s.sandbox &&
          !s.unlocked.includes(POLICIES.find((p) => p.id === id)!.unlock));
      inherited.textContent = `${t('policy.effective')} ${t((local ?? city) ? 'policy.on' : 'policy.off')}`;
    }
    const buildings = sim.mirror.readBuildings();
    summary.textContent = `${t('policy.expenses')} $${policyFee(s, buildings).toFixed(2)} / ${t('policy.week')} · ${t('policy.garbage')} ${buildings.reduce((n, b) => n + garbageRate(s, b), 0).toFixed(1)}`;
  }
  async function change(policy: PolicyId, value: string) {
    if (pending) return;
    pending = true;
    status.textContent = '';
    const district = Number(scope.value) || null;
    update();
    try {
      const r = await sim.send({
        t: 'setPolicy',
        policy,
        district,
        on: value === 'inherit' ? null : value === 'on',
      });
      if (r.t === 'result' && !r.ok)
        status.textContent = t(r.reason ?? 'err.invalidCommand');
    } catch {
      status.textContent = t('sim.failed');
    } finally {
      pending = false;
      update();
    }
  }
  scope.onchange = update;
  const stop = sim.onEvent((e) => {
    if (
      dialog.open &&
      [
        'ready',
        'policies',
        'districts',
        'milestone',
        'buildingsChanged',
      ].includes(e.t)
    )
      update();
  });
  return {
    open() {
      update();
      dialog.showModal();
    },
    dispose() {
      stop();
      dialog.remove();
    },
  };
}
