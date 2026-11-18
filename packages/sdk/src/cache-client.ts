import type {
  SetOptions,
  GetOrSetOptions,
  DeleteOptions,
  CacheEventMap,
  CacheEventName,
} from '@cachemesh/shared';
import {
  CacheEngine,
  type EngineStats,
} from '@cachemesh/core';

export class CacheClient {
  public readonly engine: CacheEngine;

  constructor(engine: CacheEngine) {
    this.engine = engine;
  }

  /**
   * Retrieves an item from the cache.
   * Returns null if the item is missing or expired.
   */
  public async get<T>(key: string): Promise<T | null> {
    return this.engine.get<T>(key);
  }

  /**
   * Stores an item in the cache.
   */
  public async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    return this.engine.set<T>(key, value, options);
  }

  /**
   * Retrieves an item from cache, or executes the factory on cache miss.
   * Employs singleflight coalescing to eliminate cache stampedes.
   */
  public async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: GetOrSetOptions
  ): Promise<T> {
    return this.engine.getOrSet<T>(key, factory, options);
  }

  /**
   * Removes an item from the cache.
   */
  public async delete(key: string, options?: DeleteOptions): Promise<boolean> {
    return this.engine.delete(key, options);
  }

  /**
   * Checks whether a non-expired entry exists for the given key.
   */
  public async has(key: string): Promise<boolean> {
    return this.engine.has(key);
  }

  /**
   * Invalidates all cache entries carrying the specified tag.
   */
  public async invalidateTag(tag: string): Promise<number> {
    return this.engine.deleteByTag(tag);
  }

  /**
   * Clears the entire cache or all keys within a specific namespace.
   */
  public async clear(namespace?: string): Promise<void> {
    return this.engine.clear(namespace);
  }

  /**
   * Wraps an async function with automatic memoization / caching.
   *
   * Example:
   * ```ts
   * const getProductCached = cache.wrap(
   *   (id: string) => `product:${id}`,
   *   async (id: string) => db.findProduct(id),
   *   { ttl: 300 }
   * );
   * ```
   */
  public wrap<Args extends unknown[], Ret>(
    keyGenerator: (...args: Args) => string,
    fn: (...args: Args) => Promise<Ret>,
    options?: GetOrSetOptions
  ): (...args: Args) => Promise<Ret> {
    return async (...args: Args): Promise<Ret> => {
      const key = keyGenerator(...args);
      return this.getOrSet(key, () => fn(...args), options);
    };
  }

  /**
   * Retrieves operational health, sizes, and telemetry stats across all configured layers.
   */
  public async getStats(): Promise<EngineStats> {
    return this.engine.getStats();
  }

  /**
   * Subscribes to engine events (hit, miss, set, delete, evict, expire, error).
   */
  public on<K extends CacheEventName>(
    event: K,
    handler: (payload: CacheEventMap[K]) => void
  ): () => void {
    return this.engine.on(event, handler);
  }

  /**
   * Unsubscribes an event listener.
   */
  public off<K extends CacheEventName>(
    event: K,
    handler: (payload: CacheEventMap[K]) => void
  ): void {
    this.engine.off(event, handler);
  }

  /**
   * Cleanly disconnects all adapters and background reaping timers.
   */
  public async disconnect(): Promise<void> {
    return this.engine.disconnect();
  }
}
