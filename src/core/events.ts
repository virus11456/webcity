export type Unsubscribe = () => void;

/** Synchronous typed events, dispatched in subscription order. Errors propagate. */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<
    keyof Events,
    Set<(payload: unknown) => void>
  >();

  /** Subscribe independently; the returned unsubscribe is idempotent. */
  on<K extends keyof Events>(
    event: K,
    listener: (payload: Events[K]) => void,
  ): Unsubscribe {
    const wrapped = (payload: unknown): void => listener(payload as Events[K]);
    let group = this.listeners.get(event);
    if (!group) {
      group = new Set();
      this.listeners.set(event, group);
    }
    group.add(wrapped);
    return () => {
      group.delete(wrapped);
      if (group.size === 0 && this.listeners.get(event) === group)
        this.listeners.delete(event);
    };
  }

  /** Subscribe for one emission, removing the subscription before calling the listener. */
  once<K extends keyof Events>(
    event: K,
    listener: (payload: Events[K]) => void,
  ): Unsubscribe {
    let active = true;
    const off = this.on(event, (payload) => {
      if (!active) return;
      active = false;
      off();
      listener(payload);
    });
    return off;
  }

  /** Emit a snapshot: subscription changes take effect on the next emission. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const group = this.listeners.get(event);
    if (group) for (const listener of [...group]) listener(payload);
  }

  /** Remove all listeners, including those on other event types. */
  clear(): void {
    this.listeners.clear();
  }
}
