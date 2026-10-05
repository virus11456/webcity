import { expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events';

type Events = { count: number; ready: undefined; label: string };
it('dispatches typed payloads in subscription order and separates event types', () => {
  const bus = new EventBus<Events>(),
    calls: string[] = [];
  bus.on('count', (n) => calls.push(`a${n}`));
  bus.on('count', (n) => calls.push(`b${n}`));
  bus.on('label', (s) => calls.push(s));
  bus.emit('ready', undefined);
  bus.emit('count', 2);
  bus.emit('label', 'ok');
  expect(calls).toEqual(['a2', 'b2', 'ok']);
  // @ts-expect-error event names are checked
  bus.emit('missing', 3);
  // @ts-expect-error payload must match the chosen event
  bus.emit('count', 'wrong');
});
it('unsubscribe is independent and idempotent for duplicate callbacks', () => {
  const bus = new EventBus<Events>(),
    fn = vi.fn();
  const first = bus.on('count', fn),
    second = bus.on('count', fn);
  first();
  first();
  bus.emit('count', 1);
  expect(fn).toHaveBeenCalledTimes(1);
  second();
  bus.emit('count', 2);
  expect(fn).toHaveBeenCalledTimes(1);
});
it('uses a listener snapshot when subscribers change during dispatch', () => {
  const bus = new EventBus<Events>(),
    calls: string[] = [];
  let added = false;
  bus.on('count', () => {
    calls.push('first');
    remove();
    if (!added) {
      bus.on('count', () => calls.push('new'));
      added = true;
    }
  });
  const remove = bus.on('count', () => calls.push('removed'));
  bus.emit('count', 0);
  bus.emit('count', 0);
  expect(calls).toEqual(['first', 'removed', 'first', 'new']);
});
it('once is safe for self-recursion and reentrant emission before its snapshot turn', () => {
  const bus = new EventBus<Events>(),
    once = vi.fn();
  let nested = false;
  bus.on('count', () => {
    if (!nested) {
      nested = true;
      bus.emit('count', 2);
    }
  });
  bus.once('count', once);
  bus.emit('count', 1);
  expect(once).toHaveBeenCalledExactlyOnceWith(2);
  bus.once('ready', () => {
    once();
    bus.emit('ready', undefined);
  });
  bus.emit('ready', undefined);
  expect(once).toHaveBeenCalledTimes(2);
});
it('can cancel once and clear all events without old unsubscribe affecting new listeners', () => {
  const bus = new EventBus<Events>(),
    fn = vi.fn();
  const cancel = bus.once('ready', fn);
  cancel();
  bus.emit('ready', undefined);
  const old = bus.on('count', fn);
  bus.on('label', fn);
  bus.clear();
  bus.on('count', fn);
  old();
  bus.emit('count', 4);
  bus.emit('label', 'x');
  expect(fn).toHaveBeenCalledExactlyOnceWith(4);
  bus.clear();
  bus.emit('count', 5);
});
it('propagates listener errors and removes a throwing once listener', () => {
  const bus = new EventBus<Events>();
  bus.once('ready', () => {
    throw new Error('listener failure');
  });
  expect(() => bus.emit('ready', undefined)).toThrow('listener failure');
  expect(() => bus.emit('ready', undefined)).not.toThrow();
});
