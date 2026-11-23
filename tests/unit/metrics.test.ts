import { describe, it, expect, beforeEach } from "vitest";
import { MetricsCollector } from "../../src/stats/metrics.js";

describe("MetricsCollector", () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  it("should initialize with all zero values", () => {
    const stats = metrics.getStats(0);
    expect(stats).toEqual({
      totalRequests: 0,
      hits: 0,
      misses: 0,
      writes: 0,
      deletes: 0,
      evictions: 0,
      expiredKeys: 0,
      currentEntries: 0,
      hitRatio: 0.0,
    });
  });

  it("should correctly record operations and compute hit ratio", () => {
    metrics.recordWrite();
    metrics.recordWrite();
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordMiss();

    // 3 hits, 1 miss -> total reads = 4 -> hit ratio = 3 / 4 = 0.75
    expect(metrics.getHitRatio()).toBe(0.75);

    const stats = metrics.getStats(2);
    expect(stats.writes).toBe(2);
    expect(stats.hits).toBe(3);
    expect(stats.misses).toBe(1);
    expect(stats.hitRatio).toBe(0.75);
    expect(stats.currentEntries).toBe(2);
  });

  it("should handle 0 total reads gracefully without division by zero", () => {
    expect(metrics.getHitRatio()).toBe(0.0);
  });

  it("should track deletes, evictions, and expired keys", () => {
    metrics.recordDelete();
    metrics.recordEviction();
    metrics.recordEviction();
    metrics.recordExpired();

    const stats = metrics.getStats(10);
    expect(stats.deletes).toBe(1);
    expect(stats.evictions).toBe(2);
    expect(stats.expiredKeys).toBe(1);
  });

  it("should reset metrics cleanly", () => {
    metrics.recordWrite();
    metrics.recordHit();
    metrics.reset();

    const stats = metrics.getStats(0);
    expect(stats.writes).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.hitRatio).toBe(0.0);
  });
});
