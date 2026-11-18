import type { CacheEntry } from './entry.js';
import type { SetOptions } from './options.js';

export interface AdapterCapabilities {
  /** Can inspect remaining TTL without fetching the full payload value */
  hasTTLInspection: boolean;
  /** Supports atomic increments or conditional lock operations */
  hasAtomicOperations: boolean;
  /** Can natively publish and subscribe to cross-instance invalidation messages */
  hasPubSub: boolean;
  /** Maintains a secondary index of tags for fast tag invalidation */
  hasTagIndexing: boolean;
}

export interface AdapterStats {
  size: number;
  maxSize?: number;
  evictions?: number;
  expirations?: number;
  hits?: number;
  misses?: number;
  bytesUsed?: number;
  [key: string]: unknown;
}

export interface CacheAdapter {
  /** Unique name or identifier for this adapter instance (e.g. 'memory-l1', 'redis-l2') */
  readonly name: string;

  /** Declared feature capabilities of this adapter */
  readonly capabilities: AdapterCapabilities;

  // Lifecycle
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  isHealthy(): Promise<boolean>;

  // Key operations
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, options?: SetOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;

  // Batch operations
  getMany<T>(keys: string[]): Promise<Map<string, CacheEntry<T>>>;
  setMany<T>(entries: Array<{ key: string; value: T; options?: SetOptions }>): Promise<void>;
  deleteMany(keys: string[]): Promise<number>;

  // Scoped invalidation
  clear(namespace?: string): Promise<void>;
  deleteByTag(tag: string): Promise<number>;

  // Inspection
  getSize?(): Promise<number>;
  getStats?(): Promise<AdapterStats>;
}
