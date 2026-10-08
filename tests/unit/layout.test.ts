import { describe, expect, it, vi, afterEach } from 'vitest';
import { classifyLayout, layout, observeLayout } from '@/ui/store';

afterEach(() => vi.unstubAllGlobals());
describe('UI viewport modes', () => {
  it.each([
    [393, 852, false, 'phone-portrait'],
    [852, 393, false, 'phone-landscape'],
    [1440, 499, true, 'phone-landscape'],
    [767, 900, true, 'phone-portrait'],
    [768, 900, false, 'tablet'],
    [1023, 900, true, 'tablet'],
    [1024, 900, true, 'desktop'],
    [1194, 834, false, 'tablet'],
    [1440, 500, true, 'desktop'],
  ] as const)(
    'classifies %s × %s with fine pointer %s',
    (w, h, fine, expected) => {
      expect(classifyLayout(w, h, fine)).toBe(expected);
    },
  );
  it('shares subscriptions, responds to resize/pointer changes and cleans up the last consumer', () => {
    const events = new EventTarget();
    const pointer = Object.assign(new EventTarget(), { matches: false });
    const remove = vi.spyOn(events, 'removeEventListener');
    const removePointer = vi.spyOn(pointer, 'removeEventListener');
    const viewport = Object.assign(events, {
      innerWidth: 393,
      innerHeight: 852,
      matchMedia: () => pointer,
    });
    vi.stubGlobal('window', viewport);
    const stopA = observeLayout();
    const stopB = observeLayout();
    expect(layout.value).toBe('phone-portrait');
    viewport.innerWidth = 1440;
    viewport.innerHeight = 900;
    events.dispatchEvent(new Event('resize'));
    expect(layout.value).toBe('tablet');
    pointer.matches = true;
    pointer.dispatchEvent(new Event('change'));
    expect(layout.value).toBe('desktop');
    stopA();
    stopA();
    expect(remove).not.toHaveBeenCalled();
    stopB();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(removePointer).toHaveBeenCalledTimes(1);
    viewport.innerWidth = 393;
    events.dispatchEvent(new Event('resize'));
    expect(layout.value).toBe('desktop');
    const stopC = observeLayout();
    expect(layout.value).toBe('phone-portrait');
    stopC();
  });
});
