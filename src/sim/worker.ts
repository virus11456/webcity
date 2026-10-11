import { serialize, deserialize } from '../save/serializer';
import { SIM_RUNTIME } from '../data/simRuntime';
import { CommandDispatcher } from './commands';
import { TimingWindow } from '../core/timingWindow';
import { PERFORMANCE } from '../data/performance';

// Worker name is a diagnostic opt-in; ordinary gameplay never measures ticks.
const diagnostics =
  (globalThis as typeof globalThis & { name?: string }).name ===
  'webcity-debug';
const timing = diagnostics ? new TimingWindow(PERFORMANCE.samples) : undefined;
let reported = 0;

const dispatcher = new CommandDispatcher(
  (event) =>
    globalThis.postMessage(event, {
      transfer:
        event.t === 'vehicles' ? [event.data.buffer as ArrayBuffer] : [],
    }),
  { serialize, deserialize },
  timing ? (ms) => timing.record(ms) : undefined,
);
let last = performance.now();
const pulse = () => {
  const now = performance.now();
  dispatcher.advance(now - last);
  if (timing && now - reported >= PERFORMANCE.reportMs) {
    globalThis.postMessage({ t: 'performance', tick: timing.read() });
    reported = now;
  }
  last = now;
};
globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
  // Charge elapsed time at the OLD speed before applying a speed command.
  pulse();
  dispatcher.handle(event.data);
  // Map generation must not count as simulation time.
  last = performance.now();
});
setInterval(pulse, SIM_RUNTIME.pulseMs);
