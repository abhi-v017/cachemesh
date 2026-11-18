import type { CacheEventMap, CacheEventName } from '@cachemesh/shared';

type EventHandler<K extends CacheEventName> = (payload: CacheEventMap[K]) => void;

/**
 * Lightweight, strictly typed event emitter for CacheMesh lifecycle and metrics events.
 */
export class TypedEventEmitter {
  private readonly listeners = new Map<CacheEventName, Set<EventHandler<any>>>();

  public on<K extends CacheEventName>(event: K, handler: EventHandler<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);

    // Return unsubscribe function
    return () => {
      this.off(event, handler);
    };
  }

  public off<K extends CacheEventName>(event: K, handler: EventHandler<K>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public emit<K extends CacheEventName>(event: K, payload: CacheEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) {
      return;
    }

    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        // Event handlers should not crash the cache engine
        console.error(`[CacheMesh] Uncaught error in '${event}' event listener:`, err);
      }
    }
  }

  public removeAllListeners(): void {
    this.listeners.clear();
  }
}
