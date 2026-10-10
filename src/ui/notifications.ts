import { CityNotices, NoticeQueue } from './cityNotices';
import { NOTIFICATIONS as C } from '../data/notifications';
import type { SimClient } from '../bridge/simClient';
import type { Vec2 } from '../world/types';
import { t } from './i18n/t';
import './styles/notifications.css';
export function createNotifications(
  parent: HTMLElement,
  client: SimClient,
  locate: (p: Vec2) => void,
) {
  const host = document.createElement('aside'),
    model = new CityNotices(),
    queue = new NoticeQueue();
  host.className = 'city-notifications';
  host.setAttribute('aria-label', t('notice.title'));
  host.setAttribute('aria-live', 'polite');
  parent.append(host);
  const paint = () => {
    host.replaceChildren();
    for (const n of queue.visible) {
      const card = document.createElement('div'),
        message = document.createElement(n.pos ? 'button' : 'p'),
        close = document.createElement('button');
      card.className = `city-notice city-notice--${n.tone}`;
      card.dataset.code = n.code;
      message.className = 'notice-message';
      message.textContent =
        t(`notice.${n.code}`) +
        (n.count
          ? ` · ${n.count}`
          : n.index !== undefined
            ? ` · ${n.index}`
            : '');
      if (n.pos) {
        message.title = t('notice.locate');
        message.onclick = () => {
          locate(n.pos!);
          queue.dismiss(n.key);
          paint();
        };
      }
      close.className = 'notice-dismiss';
      close.textContent = '';
      close.setAttribute('aria-label', t('notice.dismiss'));
      close.onclick = () => {
        queue.dismiss(n.key);
        paint();
      };
      card.append(message, close);
      host.append(card);
    }
  };
  const accept = (e: Parameters<CityNotices['accept']>[0]) => {
    if (e.t === 'ready') queue.clear();
    let changed = false;
    for (const n of model.accept(e))
      changed = queue.push(n, performance.now()) || changed;
    if (changed || e.t === 'ready') paint();
  };
  const snapshot = client.mirror.readSnapshot();
  if (snapshot) accept({ t: 'ready', reqId: 0, snapshot });
  const off = client.onEvent(accept),
    timer = window.setInterval(() => {
      if (queue.expire(performance.now())) paint();
    }, C.pollMs);
  const position = () => {
    host.style.top = `${(parent.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 100) + 10}px`;
  };
  const observer = new ResizeObserver(position),
    bar = parent.querySelector('.topbar');
  if (bar) observer.observe(bar);
  window.addEventListener('resize', position);
  position();
  return {
    quality(level: 'low' | 'medium') {
      const code = level === 'low' ? 'qualityLow' : 'qualityMedium';
      if (queue.push({ key: code, code, tone: 'info' }, performance.now()))
        paint();
    },
    dispose() {
      off();
      clearInterval(timer);
      observer.disconnect();
      window.removeEventListener('resize', position);
      queue.clear();
      host.remove();
    },
  };
}
