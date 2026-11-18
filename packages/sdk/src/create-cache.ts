import { CacheEngine, type LayerConfig } from '@cachemesh/core';
import { MemoryAdapter, type MemoryAdapterOptions } from '@cachemesh/adapters';
import type { InvalidationBus } from '@cachemesh/core';
import { CacheClient } from './cache-client.js';

export interface CreateCacheOptions {
  /**
   * Optional global namespace prefix for keys.
   * Example: 'ecommerce:production'
   */
  namespace?: string;

  /**
   * Default TTL in seconds for entries where no per-key TTL is provided.
   */
  defaultTTL?: number;

  /**
   * Array of configured cache layers.
   * If omitted, a default in-memory LRU layer is automatically created.
   */
  layers?: LayerConfig[];

  /**
   * Configuration options for the default in-memory layer (used if `layers` is not provided).
   */
  memory?: MemoryAdapterOptions;

  /**
   * Invalidation bus for cross-layer or cross-process invalidation synchronization.
   */
  invalidationBus?: InvalidationBus;

  /**
   * Unique instance identifier.
   */
  instanceId?: string;
}

/**
 * Creates and initializes a CacheMesh cache client.
 *
 * Example (Zero-config in-memory cache):
 * ```ts
 * const cache = createCache();
 * await cache.set('user:42', { name: 'Alice' }, { ttl: 300 });
 * const user = await cache.get('user:42');
 * ```
 *
 * Example (Multi-level custom setup):
 * ```ts
 * const cache = createCache({
 *   namespace: 'myapp',
 *   defaultTTL: 300,
 *   layers: [
 *     { name: 'memory-l1', adapter: new MemoryAdapter({ maxSize: 5000, policy: 'lru' }) },
 *     { name: 'redis-l2', adapter: new RedisAdapter({ ... }) }
 *   ]
 * });
 * ```
 */
export function createCache(options: CreateCacheOptions = {}): CacheClient {
  let layers = options.layers;

  // Provide out-of-the-box in-memory layer if none specified
  if (!layers || layers.length === 0) {
    const memoryAdapter = new MemoryAdapter({
      maxSize: options.memory?.maxSize ?? 1000,
      policy: options.memory?.policy ?? 'lru',
      cloneStrategy: options.memory?.cloneStrategy ?? 'none',
      defaultTTL: options.defaultTTL,
      enableActiveReaping: options.memory?.enableActiveReaping ?? true,
      ttlCheckIntervalMs: options.memory?.ttlCheckIntervalMs ?? 1000,
      maxBytes: options.memory?.maxBytes,
      name: options.memory?.name ?? 'memory-l1',
    });

    layers = [
      {
        name: 'memory-l1',
        adapter: memoryAdapter,
        priority: 10,
      },
    ];
  }

  const engine = new CacheEngine({
    layers,
    namespace: options.namespace,
    defaultTTL: options.defaultTTL,
    invalidationBus: options.invalidationBus,
    instanceId: options.instanceId,
  });

  return new CacheClient(engine);
}
