import { IMemoryStore } from "./types.js";
import { MetricsCollector } from "../stats/metrics.js";

export interface LRUEvictionOptions {
  /** Maximum number of entries permitted in memory. If undefined or <= 0, capacity is unbounded. */
  maxEntries?: number;
}

/**
 * Manages Least Recently Used (LRU) capacity enforcement.
 *
 * When the store reaches capacity, the least recently accessed/inserted
 * entry is evicted in O(1) time before new entries are accepted.
 */
export class LRUEviction {
  private readonly store: IMemoryStore;
  private readonly metrics: MetricsCollector;
  private readonly maxEntries?: number;

  constructor(store: IMemoryStore, metrics: MetricsCollector, options: LRUEvictionOptions = {}) {
    this.store = store;
    this.metrics = metrics;
    this.maxEntries =
      typeof options.maxEntries === "number" && options.maxEntries > 0
        ? options.maxEntries
        : undefined;
  }

  /**
   * Returns the configured capacity limit, or undefined if unbounded.
   */
  public getMaxEntries(): number | undefined {
    return this.maxEntries;
  }

  /**
   * Returns whether capacity enforcement is active.
   */
  public isEnabled(): boolean {
    return typeof this.maxEntries === "number" && this.maxEntries > 0;
  }

  /**
   * Ensures that sufficient capacity exists to insert a given key.
   *
   * If the key is already in the store, updating it will not increase size,
   * so no eviction is triggered.
   *
   * If the key is new and store.size() >= maxEntries, the oldest (LRU)
   * entry is evicted and recorded in metrics.
   *
   * Returns an array of evicted keys (if any).
   */
  public prepareForInsert(key: string): string[] {
    if (!this.isEnabled() || this.maxEntries === undefined) {
      return [];
    }

    // Overwriting an existing key does not increase total entry count
    if (this.store.has(key)) {
      return [];
    }

    const evictedKeys: string[] = [];

    while (this.store.size() >= this.maxEntries) {
      const oldestKey = this.store.getOldestKey();
      if (oldestKey === undefined) {
        break;
      }

      this.store.delete(oldestKey);
      this.metrics.recordEviction();
      evictedKeys.push(oldestKey);
    }

    return evictedKeys;
  }
}
