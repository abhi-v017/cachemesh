/**
 * Supported eviction algorithms for in-memory caching.
 */
export type EvictionPolicy = 'lru' | 'lfu';

/**
 * Strategy for cloning in-memory objects to prevent caller mutation bugs.
 */
export type CloneStrategy = 'none' | 'shallow' | 'deep';
