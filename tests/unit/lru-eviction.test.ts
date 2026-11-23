import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../../src/engine/memory-store.js";
import { MetricsCollector } from "../../src/stats/metrics.js";
import { LRUEviction } from "../../src/engine/lru-eviction.js";
import { CacheEntry } from "../../src/engine/types.js";

describe("LRUEviction", () => {
  let store: MemoryStore;
  let metrics: MetricsCollector;

  const createEntry = (key: string, value: any): CacheEntry => {
    const now = Date.now();
    return {
      key,
      value,
      createdAt: now,
      accessedAt: now,
      expiresAt: null,
    };
  };

  beforeEach(() => {
    store = new MemoryStore();
    metrics = new MetricsCollector();
  });

  it("should be disabled when maxEntries is not provided or <= 0", () => {
    const unbounded1 = new LRUEviction(store, metrics);
    expect(unbounded1.isEnabled()).toBe(false);
    expect(unbounded1.getMaxEntries()).toBeUndefined();

    const unbounded2 = new LRUEviction(store, metrics, { maxEntries: 0 });
    expect(unbounded2.isEnabled()).toBe(false);

    const unbounded3 = new LRUEviction(store, metrics, { maxEntries: -5 });
    expect(unbounded3.isEnabled()).toBe(false);
  });

  it("should be enabled when maxEntries is a positive number", () => {
    const bounded = new LRUEviction(store, metrics, { maxEntries: 3 });
    expect(bounded.isEnabled()).toBe(true);
    expect(bounded.getMaxEntries()).toBe(3);
  });

  it("should not evict when store is below capacity", () => {
    const lru = new LRUEviction(store, metrics, { maxEntries: 3 });

    store.set("k1", createEntry("k1", 1));
    const evicted = lru.prepareForInsert("k2");

    expect(evicted).toEqual([]);
    expect(store.size()).toBe(1);
    expect(metrics.getStats(1).evictions).toBe(0);
  });

  it("should evict the oldest key when store is at capacity", () => {
    const lru = new LRUEviction(store, metrics, { maxEntries: 2 });

    store.set("k1", createEntry("k1", 1));
    store.set("k2", createEntry("k2", 2));
    expect(store.size()).toBe(2);

    // Adding k3 must evict k1 (the oldest)
    const evicted = lru.prepareForInsert("k3");
    expect(evicted).toEqual(["k1"]);
    expect(store.has("k1")).toBe(false);
    expect(store.has("k2")).toBe(true);
    expect(store.size()).toBe(1);
    expect(metrics.getStats(1).evictions).toBe(1);
  });

  it("should not evict when updating an existing key at capacity", () => {
    const lru = new LRUEviction(store, metrics, { maxEntries: 2 });

    store.set("k1", createEntry("k1", 1));
    store.set("k2", createEntry("k2", 2));
    expect(store.size()).toBe(2);

    // Overwriting k1 should NOT trigger eviction
    const evicted = lru.prepareForInsert("k1");
    expect(evicted).toEqual([]);
    expect(store.size()).toBe(2);
    expect(metrics.getStats(2).evictions).toBe(0);
  });

  it("should evict least recently used key after read/touch operations", () => {
    const lru = new LRUEviction(store, metrics, { maxEntries: 3 });

    store.set("a", createEntry("a", 1));
    store.set("b", createEntry("b", 2));
    store.set("c", createEntry("c", 3));

    // Order: a, b, c. Touch 'a' to make it most recently used
    store.touch("a");
    // New order: b, c, a. Oldest is now 'b'

    const evicted = lru.prepareForInsert("d");
    expect(evicted).toEqual(["b"]);
    expect(store.has("b")).toBe(false);
    expect(store.has("a")).toBe(true);
    expect(store.has("c")).toBe(true);
  });
});
