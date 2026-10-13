import type { SimClient } from '../bridge/simClient';
import { undoRefund } from '../world/constructionUndo';
import { createIcon } from './icons';
import { t } from './i18n/t';
import './styles/undo.css';
export function createUndoControls(
  parent: HTMLElement,
  sim: SimClient,
  cancelTool: () => void,
) {
  const button = document.createElement('button'),
    status = document.createElement('output');
  button.className = 'undo-trigger';
  button.setAttribute('aria-label', t('undo.title'));
  button.setAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
  status.className = 'undo-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  let pending = false,
    signature = '';
  function update() {
    const v = sim.mirror.readUndo(),
      refund =
        v.day === undefined
          ? 0
          : undoRefund(
              { day: v.day, cost: v.cost },
              sim.mirror.clock?.day ?? 0,
            );
    const next = `${v.count}:${v.action}:${refund}:${pending}:${sim.mirror.gameOver}`;
    if (next === signature) return;
    signature = next;
    button.disabled = pending || v.count === 0 || sim.mirror.gameOver;
    button.dataset.count = String(v.count);
    button.dataset.refund = String(refund);
    const description = `${t('undo.title')} (${v.count})${v.action ? ` · ${t(`undo.${v.action}`)} · $${refund.toLocaleString('zh-TW')}` : ''}`;
    const fullLabel = document.createElement('span');
    fullLabel.className = 'undo-full-label';
    fullLabel.textContent = description;
    const shortLabel = document.createElement('span');
    shortLabel.className = 'undo-short-label';
    shortLabel.textContent = t('undo.title');
    const count = document.createElement('span');
    count.className = 'undo-short-label';
    count.textContent = `(${v.count})`;
    button.replaceChildren(createIcon('back'), fullLabel, shortLabel, count);
    button.dataset.tooltip = `${description}\n${t('undo.hint')}`;
    button.title = t('undo.hint');
  }
  async function undo() {
    if (pending || !sim.mirror.readUndo().count) return;
    pending = true;
    update();
    cancelTool();
    try {
      const r = await sim.send({ t: 'undo' });
      status.textContent =
        r.t === 'result' && r.ok
          ? `${t('undo.done')} $${(r.refund ?? 0).toLocaleString('zh-TW')}`
          : r.t === 'result'
            ? t(r.reason ?? 'sim.failed')
            : t('sim.failed');
    } catch {
      status.textContent = t('sim.failed');
    } finally {
      status.hidden = false;
      pending = false;
      update();
    }
  }
  button.onclick = () => void undo();
  (parent.querySelector('.road-tabs') ?? parent).append(button);
  parent.append(status);
  const stop = sim.onEvent((e) => {
    if (['ready', 'undoState', 'clock', 'economy'].includes(e.t)) update();
    if (e.t === 'undoState' && e.view.count > 0 && !pending)
      status.hidden = true;
  });
  update();
  return {
    undo,
    dispose() {
      stop();
      button.remove();
      status.remove();
    },
  };
}
