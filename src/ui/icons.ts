import {
  ICON_PATHS,
  ITEM_ICONS,
  INFO_ICONS,
  PROBLEM_ICONS,
  type IconName,
} from '../data/icons';
import { ZH_TW } from './i18n/zh-TW';
/** SVG paths never contain text and remain decorative beside accessible labels. */
export function createIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ui-icon');
  svg.dataset.icon = name;
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.append(path);
  return svg;
}
/** Translate existing imperative controls into the same artwork as Preact components. */
export function iconForKey(key: string): IconName {
  const part = key.split('.').at(-1)!;
  if (ITEM_ICONS[part]) return ITEM_ICONS[part];
  if (key.startsWith('problem.')) return PROBLEM_ICONS[part] ?? 'warning';
  if (key.startsWith('info.'))
    return INFO_ICONS[part] ?? (part === 'close' ? 'close' : 'layers');
  if (/close|cancel|dismiss|stop|exit/i.test(part)) return 'close';
  if (/back|return|undo/i.test(part)) return 'back';
  if (/confirm|enable|apply|accept/i.test(part)) return 'check';
  if (/pause|disable/i.test(part)) return 'pause';
  if (/play|resume|continue/i.test(part)) return 'play';
  if (/rotate|reset|reload/i.test(part)) return 'rotate';
  if (/locate|follow/i.test(part)) return 'locate';
  if (/new|add|increase|raise/i.test(part)) return 'plus';
  if (/lower|decrease/i.test(part)) return 'minus';
  if (/settings/i.test(part)) return 'settings';
  if (key.startsWith('save.'))
    return /load|import/.test(part)
      ? 'folder'
      : /delete/.test(part)
        ? 'garbage'
        : 'save';
  if (key.startsWith('finance.')) return 'money';
  if (key.startsWith('bulldoze.')) return 'bulldoze';
  if (key.startsWith('power.')) return 'power';
  if (key.startsWith('water.')) return 'water';
  if (key.startsWith('service.')) return 'service';
  if (key.startsWith('zone.')) return 'zone';
  if (key.startsWith('road.'))
    return /explore|demo/.test(part)
      ? 'explore'
      : /curve/.test(part)
        ? 'curve'
        : 'road';
  if (key.startsWith('menu.'))
    return /load/.test(part)
      ? 'folder'
      : /settings/.test(part)
        ? 'settings'
        : 'home';
  if (key.startsWith('asset.') || key.startsWith('gallery.')) return 'tower';
  if (/detail|expand|info/.test(part)) return 'info';
  return 'next';
}
const labelIcons = new Map<string, IconName>(
  Object.entries(ZH_TW).map(([key, label]) => [
    label.split(' · ')[0]!,
    iconForKey(key),
  ]),
);
labelIcons.set('×1', 'play');
labelIcons.set('×2', 'fast');
labelIcons.set('×4', 'fast');
/** Event-driven adapter for the legacy DOM controls; no frame scan and no simulation writes. */
export function decorateControls(root: HTMLElement): () => void {
  const decorate = (button: Element) => {
    if (!(button instanceof HTMLButtonElement) || button.querySelector('svg'))
      return;
    const label =
      button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
    const name =
      ITEM_ICONS[(button as HTMLElement).dataset.item ?? ''] ??
      labelIcons.get(label) ??
      'next';
    button.prepend(createIcon(name));
  };
  const inspect = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.matches('button')) decorate(node);
    for (const button of node.querySelectorAll('button')) decorate(button);
  };
  inspect(root);
  const observer = new MutationObserver((records) => {
    const buttons = new Set<Element>();
    for (const record of records) {
      const parent =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      const button = parent?.closest('button');
      if (button) buttons.add(button);
      for (const node of record.addedNodes) inspect(node);
    }
    for (const button of buttons) decorate(button);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
