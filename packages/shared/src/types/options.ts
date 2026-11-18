import type { CloneStrategy } from './eviction.js';

export interface SetOptions {
  /**
   * Time to live in seconds.
   * If not provided, the default TTL configured for the cache instance is used.
   */
  ttl?: number;

  /**
   * Optional tags associated with this key for tag-based invalidation.
   */
  tags?: string[];

  /**
   * If true, only set the key if it does not already exist.
   */
  ifNotExists?: boolean;

  /**
   * Optional clone strategy override for this specific write.
   */
  cloneStrategy?: CloneStrategy;
}

export interface GetOrSetOptions extends SetOptions {
  /**
   * Timeout in milliseconds for executing the factory function.
   * Prevents hung origin calls from blocking singleflight queues.
   */
  timeoutMs?: number;

  /**
   * Whether to enable stale-while-revalidate (SWR) for this key.
   * If true, returns stale data while revalidating in background.
   */
  staleWhileRevalidate?: boolean;

  /**
   * Maximum grace period in seconds that stale data is acceptable.
   */
  staleGracePeriodSec?: number;
}

export interface DeleteOptions {
  /**
   * If true, also broadcast an invalidation message across the distributed invalidation bus.
   * Default: true.
   */
  broadcast?: boolean;
}
