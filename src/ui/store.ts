import { signal } from '@preact/signals';
export type Layout =
  'desktop' | 'tablet' | 'phone-portrait' | 'phone-landscape';
export const layout = signal<Layout>('phone-portrait');

/** Classify short landscape first; wide coarse pointers retain tablet controls. */
export function classifyLayout(
  width: number,
  height: number,
  finePointer: boolean,
): Layout {
  if (height < 500 && width > height) return 'phone-landscape';
  if (width >= 1024 && finePointer) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'phone-portrait';
}

let consumers = 0;
let detach: (() => void) | undefined;
/** Share one viewport subscription and return an idempotent lifecycle cleanup. */
export function observeLayout(): () => void {
  if (consumers++ === 0) {
    const pointer = window.matchMedia('(pointer: fine)');
    const update = () => {
      layout.value = classifyLayout(
        window.innerWidth,
        window.innerHeight,
        pointer.matches,
      );
    };
    window.addEventListener('resize', update, { passive: true });
    pointer.addEventListener('change', update);
    update();
    detach = () => {
      window.removeEventListener('resize', update);
      pointer.removeEventListener('change', update);
    };
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (--consumers === 0) {
      detach?.();
      detach = undefined;
    }
  };
}
