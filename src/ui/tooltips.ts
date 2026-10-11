import { TOOLTIPS as C } from '../data/tooltips';
import { helpText } from './helpText';
import './styles/tooltips.css';
/** Delegated UI help: never takes pointer capture or intercepts canvas gestures. */
export function attachTooltips(root: HTMLElement): () => void {
  const bubble = document.createElement('div');
  bubble.id = 'webcity-tooltip';
  bubble.className = 'game-tooltip';
  bubble.role = 'tooltip';
  bubble.hidden = true;
  document.body.append(bubble);
  let source: HTMLElement | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let leaving: ReturnType<typeof setTimeout> | undefined;
  let press: {
    id: number;
    x: number;
    y: number;
    target: HTMLElement;
    shown: boolean;
  } | null = null;
  let guard: { target: HTMLElement; until: number } | null = null;
  let touchOpen = false;
  let focusOpen = false;
  let described: string | null = null;
  let title: string | null = null;
  const pointers = new Set<number>();
  const resolve = (node: EventTarget | null): HTMLElement | null => {
    if (!(node instanceof Element)) return null;
    const target = node.closest<HTMLElement>('[data-tooltip], button');
    return target &&
      root.contains(target) &&
      helpText(target, target === source ? (title ?? undefined) : undefined)
      ? target
      : null;
  };
  const cancelTimer = () => {
    clearTimeout(pending);
    pending = undefined;
  };
  function hide() {
    cancelTimer();
    clearTimeout(leaving);
    leaving = undefined;
    observer.disconnect();
    if (source) {
      const ids = (source.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((id) => id && id !== bubble.id);
      if (ids.length) source.setAttribute('aria-describedby', ids.join(' '));
      else if (described !== null)
        source.setAttribute('aria-describedby', described);
      else source.removeAttribute('aria-describedby');
      if (title !== null && !source.hasAttribute('title')) source.title = title;
    }
    source = null;
    title = described = null;
    bubble.hidden = true;
    touchOpen = false;
    focusOpen = false;
  }
  function position() {
    if (!source) return;
    const r = source.getBoundingClientRect();
    if (
      !source.isConnected ||
      !source.getClientRects().length ||
      r.bottom <= 0 ||
      r.right <= 0 ||
      r.top >= innerHeight ||
      r.left >= innerWidth
    ) {
      hide();
      return;
    }
    const viewport = window.visualViewport;
    const css = getComputedStyle(bubble);
    const marginLeft = Math.max(
      C.marginPx,
      parseFloat(css.getPropertyValue('--tooltip-safe-left')) || 0,
    );
    const marginRight = Math.max(
      C.marginPx,
      parseFloat(css.getPropertyValue('--tooltip-safe-right')) || 0,
    );
    const marginTop = Math.max(
      C.marginPx,
      parseFloat(css.getPropertyValue('--tooltip-safe-top')) || 0,
    );
    const marginBottom = Math.max(
      C.marginPx,
      parseFloat(css.getPropertyValue('--tooltip-safe-bottom')) || 0,
    );
    const left = (viewport?.offsetLeft ?? 0) + marginLeft;
    const top = (viewport?.offsetTop ?? 0) + marginTop;
    const width = viewport?.width ?? innerWidth,
      height = viewport?.height ?? innerHeight;
    bubble.style.maxWidth = `${Math.max(0, Math.min(C.widthPx, width - marginLeft - marginRight))}px`;
    bubble.style.maxHeight = `${Math.max(0, height - marginTop - marginBottom)}px`;
    const b = bubble.getBoundingClientRect();
    const above = r.top - b.height - C.gapPx;
    bubble.style.left = `${Math.max(left, Math.min(left + width - marginLeft - marginRight - b.width, r.left + (r.width - b.width) / 2))}px`;
    bubble.style.top = `${Math.max(top, Math.min(top + height - marginTop - marginBottom - b.height, above >= top ? above : r.bottom + C.gapPx))}px`;
  }
  const observer = new MutationObserver(() => {
    if (!source) return;
    const text = helpText(source, title ?? undefined);
    if (!text) {
      hide();
      return;
    }
    if (bubble.textContent !== text) bubble.textContent = text;
    position();
  });
  function show(target: HTMLElement, touch = false, keyboard = false) {
    const text = helpText(target);
    if (!text || !target.isConnected) return;
    hide();
    source = target;
    touchOpen = touch;
    focusOpen = keyboard;
    described = target.getAttribute('aria-describedby');
    title = target.getAttribute('title');
    if (title !== null) target.removeAttribute('title');
    target.setAttribute(
      'aria-describedby',
      [described, bubble.id].filter(Boolean).join(' '),
    );
    bubble.textContent = text;
    (target.closest('dialog[open]') ?? document.body).append(bubble);
    bubble.hidden = false;
    position();
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tooltip', 'hidden', 'open'],
    });
  }
  const over = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || pointers.size) return;
    if (bubble.contains(e.target as Node)) {
      clearTimeout(leaving);
      return;
    }
    const target = resolve(e.target);
    if (!target) return;
    clearTimeout(leaving);
    if (source === target) return;
    cancelTimer();
    pending = setTimeout(() => show(target), C.hoverMs);
  };
  const out = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || touchOpen) return;
    const from = resolve(e.target);
    if (
      from?.contains(e.relatedTarget as Node | null) ||
      bubble.contains(e.relatedTarget as Node | null)
    )
      return;
    cancelTimer();
    clearTimeout(leaving);
    leaving = setTimeout(hide, C.leaveMs);
  };
  const down = (e: PointerEvent) => {
    pointers.add(e.pointerId);
    guard = null;
    if (pointers.size > 1) {
      press = null;
      hide();
      return;
    }
    if (bubble.contains(e.target as Node)) return;
    hide();
    const target = resolve(e.target);
    if (!target || e.pointerType !== 'touch') return;
    press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      target,
      shown: false,
    };
    pending = setTimeout(() => {
      if (!press || pointers.size !== 1) return;
      press.shown = true;
      show(press.target, true);
    }, C.longPressMs);
  };
  const move = (e: PointerEvent) => {
    if (
      press?.id === e.pointerId &&
      Math.hypot(e.clientX - press.x, e.clientY - press.y) > C.dragPx
    ) {
      if (press.shown)
        guard = {
          target: press.target,
          until: performance.now() + C.clickGuardMs,
        };
      press = null;
      hide();
    }
  };
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (press?.id !== e.pointerId) return;
    cancelTimer();
    if (press.shown)
      guard = {
        target: press.target,
        until: performance.now() + C.clickGuardMs,
      };
    press = null;
  };
  const cancel = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    press = null;
    hide();
  };
  const click = (e: MouseEvent) => {
    if (
      guard &&
      e.detail > 0 &&
      performance.now() <= guard.until &&
      guard.target.contains(e.target as Node)
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
      guard = null;
    } else if (!bubble.contains(e.target as Node)) hide();
  };
  const focus = (e: FocusEvent) => {
    if (pointers.size || touchOpen) return;
    const target = resolve(e.target);
    if (target) show(target, false, true);
  };
  const blur = (e: FocusEvent) => {
    if (source?.contains(e.target as Node) && !touchOpen) hide();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !bubble.hidden) {
      e.preventDefault();
      hide();
      e.stopPropagation();
    }
  };
  const context = (e: MouseEvent) => {
    if (press || touchOpen) {
      if (resolve(e.target)) e.preventDefault();
    }
  };
  const scroll = (e: Event) => {
    if (!bubble.contains(e.target as Node)) {
      press = null;
      if (focusOpen) position();
      else hide();
    }
  };
  const reset = () => {
    pointers.clear();
    press = null;
    guard = null;
    hide();
  };
  document.addEventListener('pointerover', over);
  document.addEventListener('pointerout', out);
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('click', click, true);
  document.addEventListener('contextmenu', context);
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', blur);
  document.addEventListener('keydown', key, true);
  document.addEventListener('scroll', scroll, true);
  document.addEventListener('close', reset, true);
  document.addEventListener('visibilitychange', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('resize', reset);
  window.visualViewport?.addEventListener('resize', reset);
  return () => {
    reset();
    bubble.remove();
    document.removeEventListener('pointerover', over);
    document.removeEventListener('pointerout', out);
    document.removeEventListener('pointerdown', down, true);
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', cancel, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('contextmenu', context);
    document.removeEventListener('focusin', focus);
    document.removeEventListener('focusout', blur);
    document.removeEventListener('keydown', key, true);
    document.removeEventListener('scroll', scroll, true);
    document.removeEventListener('close', reset, true);
    document.removeEventListener('visibilitychange', reset);
    window.removeEventListener('blur', reset);
    window.removeEventListener('resize', reset);
    window.visualViewport?.removeEventListener('resize', reset);
  };
}
