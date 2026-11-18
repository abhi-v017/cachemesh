import type {
  CacheAdapter,
  CacheEntry,
  SetOptions,
  AdapterStats,
  AdapterCapabilities,
  EvictionPolicy,
  CloneStrategy,
} from '@cachemesh/shared';
import {
  nowMs,
  ttlToExpiresAt,
  cloneValue,
  estimateSize,
  isExpired,
} from '@cachemesh/shared';
import { LRUStore } from './lru-store.js';
import { LFUStore } from './lfu-store.js';
import { TTLReaper } from './ttl-reaper.js';

export interface MemoryAdapterOptions {
  /** Adapter instance identifier. Default: 'memory' */
  name?: string;
  /** Maximum number of entries before eviction occurs. Default: 1000 */
  maxSize?: number;
  /** Optional maximum memory limit in bytes. */
  maxBytes?: number;
  /** Eviction algorithm: 'lru' or 'lfu'. Default: 'lru' */
  policy?: EvictionPolicy;
  /** Clone strategy for safety against external mutation: 'none' | 'shallow' | 'deep'. Default: 'none' */
  cloneStrategy?: CloneStrategy;
  /** Default TTL in seconds for entries without an explicit TTL. */
  defaultTTL?: number;
  /** Whether to enable the background active expiration sweeper. Default: true */
  enableActiveReaping?: boolean;
  /** Background active expiration sweep interval in milliseconds. Default: 1000ms */
  ttlCheckIntervalMs?: number;
}

export class MemoryAdapter implements CacheAdapter {
  public readonly name: string;
  public readonly capabilities: AdapterCapabilities = {
    hasTTLInspection: true,
    hasAtomicOperations: false,
    hasPubSub: false,
    hasTagIndexing: true,
  };

  private readonly store: LRUStore | LFUStore;
  private readonly defaultTTL?: number;
  private readonly cloneStrategy: CloneStrategy;
  private readonly maxBytes?: number;
  private readonly tagToKeys = new Map<string, Set<string>>();
  private readonly keyToTags = new Map<string, Set<string>>();
  private readonly reaper: TTLReaper;

  // Telemetry counters
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;
  private bytesUsed = 0;

  constructor(options: MemoryAdapterOptions = {}) {
    this.name = options.name ?? 'memory';
    const maxSize = options.maxSize ?? 1000;
    const policy = options.policy ?? 'lru';
    this.defaultTTL = options.defaultTTL;
    this.cloneStrategy = options.cloneStrategy ?? 'none';
    this.maxBytes = options.maxBytes;

    if (policy === 'lfu') {
      this.store = new LFUStore(maxSize);
    } else {
      this.store = new LRUStore(maxSize);
    }

    // Configure background TTL active reaper
    this.reaper = new TTLReaper(
      {
        sampleKeys: (count) => this.store.sampleKeys(count),
        checkAndExpire: (key) => this.checkAndExpire(key),
      },
      {
        intervalMs: options.ttlCheckIntervalMs ?? 1000,
        onExpired: () => {
          this.expirations++;
        },
      }
    );

    if (options.enableActiveReaping !== false) {
      this.reaper.start();
    }
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }

  public async disconnect(): Promise<void> {
    this.reaper.stop();
  }

  public async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const rawEntry = this.store.get<T>(key);
    if (!rawEntry) {
      this.misses++;
      return null;
    }

    this.hits++;
    if (this.cloneStrategy === 'none') {
      return rawEntry;
    }

    return {
      ...rawEntry,
      value: cloneValue(rawEntry.value, this.cloneStrategy),
    };
  }

  public async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    const now = nowMs();
    const effectiveTtl = options?.ttl ?? this.defaultTTL;
    const expiresAt = ttlToExpiresAt(effectiveTtl, now);

    // Apply clone strategy on insertion if specified
    const strategy = options?.cloneStrategy ?? this.cloneStrategy;
    const storedValue = cloneValue(value, strategy);

    const entry: CacheEntry<T> = {
      key,
      value: storedValue,
      expiresAt,
      createdAt: now,
      tags: options?.tags ? [...options.tags] : undefined,
    };

    // If setting with maxBytes limit, track byte sizing
    if (this.maxBytes) {
      const estimated = estimateSize(storedValue);
      this.bytesUsed += estimated;
    }

    const eviction = this.store.set(key, entry);
    if (eviction) {
      this.evictions++;
      this.cleanupKeyTags(eviction.key);
    }

    // Update tag index
    this.indexKeyTags(key, options?.tags);
  }

  public async delete(key: string): Promise<boolean> {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.cleanupKeyTags(key);
    }
    return deleted;
  }

  public async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  public async getMany<T>(keys: string[]): Promise<Map<string, CacheEntry<T>>> {
    const results = new Map<string, CacheEntry<T>>();
    for (const key of keys) {
      const entry = await this.get<T>(key);
      if (entry) {
        results.set(key, entry);
      }
    }
    return results;
  }

  public async setMany<T>(entries: Array<{ key: string; value: T; options?: SetOptions }>): Promise<void> {
    for (const item of entries) {
      await this.set(item.key, item.value, item.options);
    }
  }

  public async deleteMany(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  public async clear(namespace?: string): Promise<void> {
    if (!namespace) {
      this.store.clear();
      this.tagToKeys.clear();
      this.keyToTags.clear();
      this.bytesUsed = 0;
      return;
    }

    // Scoped clear by namespace prefix
    const prefix = `${namespace}:`;
    const keysToDelete: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }
  }

  public async deleteByTag(tag: string): Promise<number> {
    const keys = this.tagToKeys.get(tag);
    if (!keys || keys.size === 0) {
      return 0;
    }

    const keysToDelete = Array.from(keys);
    let count = 0;
    for (const key of keysToDelete) {
      if (await this.delete(key)) {
        count++;
      }
    }

    this.tagToKeys.delete(tag);
    return count;
  }

  public async getSize(): Promise<number> {
    return this.store.size;
  }

  public async getStats(): Promise<AdapterStats> {
    return {
      size: this.store.size,
      maxSize: this.store.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
      bytesUsed: this.bytesUsed,
    };
  }

  /**
   * Helper used by active reaper to check and remove expired entry.
   */
  private checkAndExpire(key: string): boolean {
    const entry = this.store.peek(key);
    if (!entry) {
      return false;
    }

    if (isExpired(entry.expiresAt)) {
      this.delete(key);
      return true;
    }

    return false;
  }

  private indexKeyTags(key: string, tags?: string[]): void {
    this.cleanupKeyTags(key);

    if (!tags || tags.length === 0) {
      return;
    }

    const tagSet = new Set(tags);
    this.keyToTags.set(key, tagSet);

    for (const tag of tagSet) {
      let keySet = this.tagToKeys.get(tag);
      if (!keySet) {
        keySet = new Set();
        this.tagToKeys.set(tag, keySet);
      }
      keySet.add(key);
    }
  }

  private cleanupKeyTags(key: string): void {
    const tags = this.keyToTags.get(key);
    if (!tags) {
      return;
    }

    for (const tag of tags) {
      const keys = this.tagToKeys.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.tagToKeys.delete(tag);
        }
      }
    }

    this.keyToTags.delete(key);
  }
}
