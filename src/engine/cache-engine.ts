import { CacheValue, SetOptions, CacheEntry, IMemoryStore } from "./types.js";
import { MemoryStore } from "./memory-store.js";
import { MetricsCollector, CacheStats } from "../stats/metrics.js";
import { TTLManager, TTLManagerOptions } from "./ttl-manager.js";
import { LRUEviction } from "./lru-eviction.js";

export interface CacheEngineOptions {
  store?: IMemoryStore;
  metrics?: MetricsCollector;
  ttlOptions?: TTLManagerOptions;
  /** Maximum number of entries before LRU eviction triggers. Omit or set <= 0 for unbounded. */
  maxEntries?: number;
}

/**
 * Core caching engine. Coordinates storage, expiration, LRU eviction, and telemetry.
 * Completely decoupled from networking and protocols.
 */
export class CacheEngine {
  protected readonly store: IMemoryStore;
  protected readonly metrics: MetricsCollector;
  protected readonly ttlManager: TTLManager;
  protected readonly lruEviction: LRUEviction;

  constructor(options: CacheEngineOptions = {}) {
    this.store = options.store ?? new MemoryStore();
    this.metrics = options.metrics ?? new MetricsCollector();
    this.ttlManager = new TTLManager(this.store, this.metrics, options.ttlOptions);
    this.lruEviction = new LRUEviction(this.store, this.metrics, {
      maxEntries: options.maxEntries,
    });
  }

  /**
   * Stores a value for a given key with an optional TTL (in seconds).
   * Enforces LRU capacity constraints before inserting new keys.
   */
  public set(key: string, value: CacheValue, options?: SetOptions): boolean {
    // Evict oldest item if capacity limit reached and key is new
    this.lruEviction.prepareForInsert(key);

    const now = Date.now();
    const ttlSeconds = options?.ttl;
    const expiresAt =
      typeof ttlSeconds === "number" && ttlSeconds > 0 ? now + Math.floor(ttlSeconds * 1000) : null;

    const entry: CacheEntry = {
      key,
      value,
      createdAt: now,
      accessedAt: now,
      expiresAt,
    };

    this.store.set(key, entry);
    this.metrics.recordWrite();
    return true;
  }

  /**
   * Retrieves a value by key.
   * Performs lazy expiration check, refreshes LRU access order, and records telemetry.
   */
  public get(key: string): CacheValue | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      this.metrics.recordMiss();
      return undefined;
    }

    // Lazy expiration check
    if (this.ttlManager.checkAndExpire(key, entry)) {
      this.metrics.recordMiss();
      return undefined;
    }

    // Refresh access order for LRU tracking (moves key to MRU position)
    this.store.touch(key);
    this.metrics.recordHit();
    return entry.value;
  }

  /**
   * Deletes a key from the cache.
   */
  public del(key: string): boolean {
    const removed = this.store.delete(key);
    if (removed) {
      this.metrics.recordDelete();
    }
    return removed;
  }

  /**
   * Checks whether a key currently exists and is not expired.
   */
  public exists(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }

    if (this.ttlManager.checkAndExpire(key, entry)) {
      return false;
    }

    return true;
  }

  /**
   * Responds with PONG or the echo message.
   */
  public ping(message?: string): string {
    return message && message.trim().length > 0 ? message : "PONG";
  }

  /**
   * Returns current cache statistics and active entry count.
   */
  public info(): CacheStats {
    return this.metrics.getStats(this.store.size());
  }

  /**
   * Returns the current number of stored entries.
   */
  public size(): number {
    return this.store.size();
  }

  /**
   * Empties the cache store.
   */
  public clear(): void {
    this.store.clear();
  }

  /**
   * Manually runs an active sweep pass to remove expired keys.
   */
  public sweep(): number {
    return this.ttlManager.sweep();
  }

  /**
   * Stops background timers (e.g. TTL periodic sweep).
   */
  public close(): void {
    this.ttlManager.stop();
  }

  /**
   * Returns configured maximum entry limit (if set).
   */
  public getMaxEntries(): number | undefined {
    return this.lruEviction.getMaxEntries();
  }

  /**
   * Exposes the underlying LRU eviction manager.
   */
  public getLRUEviction(): LRUEviction {
    return this.lruEviction;
  }

  /**
   * Exposes the underlying TTL manager.
   */
  public getTTLManager(): TTLManager {
    return this.ttlManager;
  }

  /**
   * Exposes the underlying metrics collector.
   */
  public getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Exposes the underlying memory store.
   */
  public getStore(): IMemoryStore {
    return this.store;
  }
}
