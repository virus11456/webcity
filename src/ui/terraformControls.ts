import { TERRAFORM } from '../data/terraform';
import type { TerraformTool, TerraformToolState } from '../tools/terraformTool';
import type { TerraformDraft } from '../world/terraform';
import { t } from './i18n/t';
export function createTerraformControls(
  parent: HTMLElement,
  tool: TerraformTool,
) {
  const host = document.createElement('section');
  host.className = 'terraform-controls';
  const mode = document.createElement('select');
  mode.setAttribute('aria-label', t('terraform.mode'));
  for (const id of TERRAFORM.modes) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = t(`terraform.${id}`);
    mode.append(o);
  }
  const radius = document.createElement('select');
  radius.setAttribute('aria-label', t('terraform.radius'));
  for (const r of TERRAFORM.radii) {
    const o = document.createElement('option');
    o.value = String(r);
    o.textContent = `${r} m`;
    radius.append(o);
  }
  const change = () =>
    tool.configure(
      mode.value as TerraformDraft['mode'],
      Number(radius.value) as TerraformDraft['radius'],
    );
  mode.onchange = radius.onchange = change;
  const confirm = document.createElement('button');
  confirm.textContent = t('terraform.confirm');
  confirm.onclick = () => void tool.onConfirm();
  const cancel = document.createElement('button');
  cancel.textContent = t('power.cancel');
  cancel.onclick = () => tool.onCancel();
  const row = document.createElement('div');
  row.className = 'road-row';
  row.append(mode, radius);
  const info = document.createElement('p');
  info.textContent = t('terraform.hint');
  const status = document.createElement('output');
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'road-row tool-actions';
  actions.append(confirm, cancel);
  host.append(row, info, status, actions);
  parent.append(host);
  return {
    update(s: TerraformToolState) {
      mode.value = s.draft.mode;
      radius.value = String(s.draft.radius);
      mode.disabled = radius.disabled = cancel.disabled = s.pending;
      confirm.disabled = s.pending || !s.preview || !!s.preview.reason;
      host.dataset.valid = String(!confirm.disabled);
      host.dataset.pending = String(s.pending);
      const reason = s.reason ?? s.preview?.reason;
      status.textContent = s.pending
        ? t('road.pending')
        : reason
          ? t(reason)
          : `${t('terraform.vertices')} ${s.preview?.patch.indices.length ?? 0}`;
    },
    dispose() {
      host.remove();
    },
  };
}
