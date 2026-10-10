import { serialize, deserialize } from '../save/serializer';
import { SIM_RUNTIME } from '../data/simRuntime';
import { CommandDispatcher } from './commands';

const dispatcher = new CommandDispatcher(
  (event) => globalThis.postMessage(event),
  { serialize, deserialize },
);
let last = performance.now();
const pulse = () => {
  const now = performance.now();
  dispatcher.advance(now - last);
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
