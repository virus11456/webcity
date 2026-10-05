import { describe, expect, it, vi } from 'vitest';
import { Gestures, type InputPointer } from '../../../src/input/gestures';
const p = (id = 1, x = 100, y = 100): InputPointer => ({
  id,
  x,
  y,
  button: 0,
  ctrl: false,
  kind: 'touch',
});
function setup() {
  const sink = {
    start: vi.fn(),
    drag: vi.fn(),
    end: vi.fn(),
    tap: vi.fn(),
    longPress: vi.fn(),
    cancel: vi.fn(),
    pair: vi.fn(),
  };
  return { sink, g: new Gestures(sink) };
}
describe('gesture ownership', () => {
  it('taps below slop but never turns a drag into a tap', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.move(p(1, 102));
    g.up(p(1, 102));
    expect(sink.tap).toHaveBeenCalledOnce();
    g.down(p(), 0);
    g.move(p(1, 120));
    g.up(p(1, 130));
    expect(sink.tap).toHaveBeenCalledOnce();
    expect(sink.drag).toHaveBeenLastCalledWith(p(1, 130), 10, 0);
  });
  it('uses the full first drag delta, including initial slop', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.move(p(1, 103));
    g.move(p(1, 107));
    expect(sink.drag).toHaveBeenCalledWith(p(1, 107), 7, 0);
  });
  it('emits long press once, cancels tool, and suppresses tap/up commit', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.tick(549);
    expect(sink.longPress).not.toHaveBeenCalled();
    g.tick(550);
    g.tick(900);
    g.up(p());
    expect(sink.longPress).toHaveBeenCalledOnce();
    expect(sink.cancel).toHaveBeenCalledOnce();
    expect(sink.end).not.toHaveBeenCalled();
    expect(sink.tap).not.toHaveBeenCalled();
  });
  it('allows camera dragging after a long press without committing the cancelled tool', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.tick(600);
    g.move(p(1, 140));
    g.up(p(1, 140));
    expect(sink.longPress).toHaveBeenCalledOnce();
    expect(sink.drag).toHaveBeenCalledWith(p(1, 140), 40, 0);
    expect(sink.end).not.toHaveBeenCalled();
    expect(sink.tap).not.toHaveBeenCalled();
  });
  it('cancels immediately when second finger lands and does not resume a tool after one lifts', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.down(p(2, 300), 5);
    expect(sink.cancel).toHaveBeenCalledOnce();
    g.move(p(2, 350));
    g.tick(10);
    expect(sink.pair).toHaveBeenCalled();
    g.up(p(2, 350));
    g.move(p(1, 120));
    g.tick(1000);
    g.up(p(1, 120));
    expect(sink.end).not.toHaveBeenCalled();
    expect(sink.tap).not.toHaveBeenCalled();
    expect(sink.longPress).not.toHaveBeenCalled();
    g.down(p(), 1100);
    g.up(p());
    expect(sink.tap).toHaveBeenCalledOnce();
  });
  it('locks parallel vertical movement to tilt and suppresses pinch/rotation application', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.down(p(2, 300), 0);
    for (let y = 104; y <= 140; y += 4) {
      g.move(p(1, 100, y));
      g.move(p(2, 300, y));
      g.tick(y);
    }
    expect(sink.pair).toHaveBeenCalled();
    expect(sink.pair.mock.calls.every((c) => c[5] === true)).toBe(true);
  });
  it('batches fast parallel moves before deciding tilt versus rotation', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.down(p(2, 300), 0);
    g.move(p(1, 100, 150));
    g.move(p(2, 300, 150));
    g.tick(20);
    expect(sink.pair.mock.lastCall?.[5]).toBe(true);
  });
  it('recognizes pinch and wrapped rotation', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.down(p(2, 300), 0);
    g.move(p(2, 340));
    g.tick(10);
    expect(sink.pair.mock.calls[0]?.[2]).toBeCloseTo(200 / 240);
    expect(sink.pair.mock.calls[0]?.[5]).toBe(false);
    g.move(p(2, 340, 140));
    g.tick(20);
    expect(sink.pair.mock.lastCall?.[3]).toBeGreaterThan(0);
  });
  it('blocks a third contact until every contact lifts', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.down(p(2, 300), 0);
    g.down(p(3, 400), 0);
    g.up(p(3, 400));
    g.move(p(2, 400));
    expect(sink.pair).not.toHaveBeenCalled();
    g.up(p(2, 400));
    g.up(p());
    expect(sink.tap).not.toHaveBeenCalled();
  });
  it('cancellation is idempotent and stale up/move events cannot commit', () => {
    const { g, sink } = setup();
    g.down(p(), 0);
    g.cancel();
    g.cancel();
    g.up(p());
    g.move(p());
    expect(sink.cancel).toHaveBeenCalledOnce();
    expect(sink.end).not.toHaveBeenCalled();
  });
});
