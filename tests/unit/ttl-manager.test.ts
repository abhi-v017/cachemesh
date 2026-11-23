import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryStore } from "../../src/engine/memory-store.js";
import { MetricsCollector } from "../../src/stats/metrics.js";
import { TTLManager } from "../../src/engine/ttl-manager.js";
import { CacheEntry } from "../../src/engine/types.js";

describe("TTLManager", () => {
  let store: MemoryStore;
  let metrics: MetricsCollector;
  let ttlManager: TTLManager;

  const createEntry = (key: string, value: any, ttlMs: number | null): CacheEntry => {
    const now = Date.now();
    return {
      key,
      value,
      createdAt: now,
      accessedAt: now,
      expiresAt: ttlMs !== null ? now + ttlMs : null,
    };
  };

  beforeEach(() => {
    store = new MemoryStore();
    metrics = new MetricsCollector();
    ttlManager = new TTLManager(store, metrics, { sweepIntervalMs: 50, maxSweepBatchSize: 50 });
  });

  afterEach(() => {
    ttlManager.stop();
  });

  it("should accurately determine if an entry is expired", () => {
    const activeEntry = createEntry("k1", "v1", 10000);
    const noTtlEntry = createEntry("k2", "v2", null);
    const expiredEntry = createEntry("k3", "v3", -100);

    expect(ttlManager.isExpired(activeEntry)).toBe(false);
    expect(ttlManager.isExpired(noTtlEntry)).toBe(false);
    expect(ttlManager.isExpired(expiredEntry)).toBe(true);
  });

  it("should checkAndExpire: remove expired key and increment metric", () => {
    const expiredEntry = createEntry("k1", "v1", -50);
    store.set("k1", expiredEntry);

    const expired = ttlManager.checkAndExpire("k1", expiredEntry);
    expect(expired).toBe(true);
    expect(store.has("k1")).toBe(false);
    expect(metrics.getStats(0).expiredKeys).toBe(1);
  });

  it("should checkAndExpire: retain active key and not increment metric", () => {
    const activeEntry = createEntry("k1", "v1", 5000);
    store.set("k1", activeEntry);

    const expired = ttlManager.checkAndExpire("k1", activeEntry);
    expect(expired).toBe(false);
    expect(store.has("k1")).toBe(true);
    expect(metrics.getStats(1).expiredKeys).toBe(0);
  });

  it("should sweep expired keys and preserve valid keys", () => {
    store.set("exp1", createEntry("exp1", 1, -100));
    store.set("active1", createEntry("active1", 2, 10000));
    store.set("exp2", createEntry("exp2", 3, -10));
    store.set("noTtl", createEntry("noTtl", 4, null));

    expect(store.size()).toBe(4);

    const removed = ttlManager.sweep();
    expect(removed).toBe(2);
    expect(store.size()).toBe(2);
    expect(store.has("active1")).toBe(true);
    expect(store.has("noTtl")).toBe(true);
    expect(store.has("exp1")).toBe(false);
    expect(store.has("exp2")).toBe(false);
    expect(metrics.getStats(2).expiredKeys).toBe(2);
  });

  it("should respect maxSweepBatchSize", () => {
    const customManager = new TTLManager(store, metrics, { maxSweepBatchSize: 2 });

    store.set("exp1", createEntry("exp1", 1, -100));
    store.set("exp2", createEntry("exp2", 2, -100));
    store.set("exp3", createEntry("exp3", 3, -100));

    // Even though 3 are expired, only batch of 2 are evaluated
    const removed = customManager.sweep();
    expect(removed).toBe(2);
    expect(store.size()).toBe(1);
  });

  it("should start and stop timer cleanly", async () => {
    expect(ttlManager.isRunning()).toBe(false);

    ttlManager.start();
    expect(ttlManager.isRunning()).toBe(true);

    // Calling start again should be a no-op
    ttlManager.start();
    expect(ttlManager.isRunning()).toBe(true);

    ttlManager.stop();
    expect(ttlManager.isRunning()).toBe(false);
  });

  it("should periodically sweep keys when timer is active", async () => {
    const fastManager = new TTLManager(store, metrics, {
      sweepIntervalMs: 20,
      autoStart: true,
    });

    store.set("exp1", createEntry("exp1", "val", 10)); // expires in 10ms
    expect(store.has("exp1")).toBe(true);

    // Wait 50ms for periodic sweep to run
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(store.has("exp1")).toBe(false);
    expect(metrics.getStats(0).expiredKeys).toBe(1);

    fastManager.stop();
  });
});
