import { describe, it, expect, beforeEach } from "vitest";
import { CacheEngine } from "../../src/engine/cache-engine.js";

describe("CacheEngine", () => {
  let engine: CacheEngine;

  beforeEach(() => {
    engine = new CacheEngine();
  });

  it("should perform basic SET and GET operations", () => {
    expect(engine.set("k1", "hello")).toBe(true);
    expect(engine.get("k1")).toBe("hello");
    expect(engine.size()).toBe(1);
  });

  it("should return undefined and record a miss for non-existent key", () => {
    expect(engine.get("missing")).toBeUndefined();
    const stats = engine.info();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });

  it("should record a hit on successful GET", () => {
    engine.set("k1", "val1");
    expect(engine.get("k1")).toBe("val1");

    const stats = engine.info();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(0);
  });

  it("should update an existing key and retain correct size", () => {
    engine.set("k1", 100);
    engine.set("k1", 200);

    expect(engine.get("k1")).toBe(200);
    expect(engine.size()).toBe(1);
    expect(engine.info().writes).toBe(2);
  });

  it("should delete keys and update metrics", () => {
    engine.set("k1", "val");
    expect(engine.del("k1")).toBe(true);
    expect(engine.get("k1")).toBeUndefined();
    expect(engine.del("k1")).toBe(false);

    const stats = engine.info();
    expect(stats.deletes).toBe(1);
  });

  it("should check key existence accurately", () => {
    expect(engine.exists("k1")).toBe(false);
    engine.set("k1", "val");
    expect(engine.exists("k1")).toBe(true);
    engine.del("k1");
    expect(engine.exists("k1")).toBe(false);
  });

  it("should support caching null as a distinct value", () => {
    engine.set("nullableKey", null);
    expect(engine.exists("nullableKey")).toBe(true);
    expect(engine.get("nullableKey")).toBeNull();
    expect(engine.info().hits).toBe(1);
  });

  it("should respond to PING with PONG or custom message", () => {
    expect(engine.ping()).toBe("PONG");
    expect(engine.ping("hello")).toBe("hello");
  });

  it("should clear the store", () => {
    engine.set("k1", 1);
    engine.set("k2", 2);
    expect(engine.size()).toBe(2);

    engine.clear();
    expect(engine.size()).toBe(0);
    expect(engine.exists("k1")).toBe(false);
  });

  it("should expire keys lazily on GET after TTL elapses", async () => {
    // Set with 0.05 second TTL (50ms)
    // Note: our set accepts TTL in seconds (float or int)
    engine.set("tempKey", "temporaryValue", { ttl: 0.05 });

    expect(engine.exists("tempKey")).toBe(true);
    expect(engine.get("tempKey")).toBe("temporaryValue");

    // Wait 60ms
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Key should now be expired lazily
    expect(engine.exists("tempKey")).toBe(false);
    expect(engine.get("tempKey")).toBeUndefined();

    const stats = engine.info();
    expect(stats.expiredKeys).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it("should purge expired keys during active sweep()", async () => {
    engine.set("exp1", "val1", { ttl: 0.02 });
    engine.set("perm1", "val2"); // no TTL

    expect(engine.size()).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 30));

    const swept = engine.sweep();
    expect(swept).toBe(1);
    expect(engine.size()).toBe(1);
    expect(engine.exists("exp1")).toBe(false);
    expect(engine.exists("perm1")).toBe(true);
  });

  it("should cleanly close and stop TTL timers", () => {
    const customEngine = new CacheEngine({
      ttlOptions: { autoStart: true },
    });
    expect(customEngine.getTTLManager().isRunning()).toBe(true);
    customEngine.close();
    expect(customEngine.getTTLManager().isRunning()).toBe(false);
  });

  it("should enforce LRU capacity limit and evict oldest key", () => {
    const boundedEngine = new CacheEngine({ maxEntries: 3 });

    boundedEngine.set("k1", "v1");
    boundedEngine.set("k2", "v2");
    boundedEngine.set("k3", "v3");
    expect(boundedEngine.size()).toBe(3);

    // Reading k1 moves k1 to MRU position (access order: k2, k3, k1)
    expect(boundedEngine.get("k1")).toBe("v1");

    // Adding k4 should evict k2 (the oldest)
    boundedEngine.set("k4", "v4");

    expect(boundedEngine.size()).toBe(3);
    expect(boundedEngine.get("k2")).toBeUndefined(); // evicted
    expect(boundedEngine.get("k1")).toBe("v1"); // retained
    expect(boundedEngine.get("k3")).toBe("v3"); // retained
    expect(boundedEngine.get("k4")).toBe("v4"); // newly added

    const stats = boundedEngine.info();
    expect(stats.evictions).toBe(1);
    expect(stats.currentEntries).toBe(3);
  });

  it("should not evict when updating an existing key in a full cache", () => {
    const boundedEngine = new CacheEngine({ maxEntries: 2 });

    boundedEngine.set("a", 1);
    boundedEngine.set("b", 2);
    expect(boundedEngine.size()).toBe(2);

    // Update existing key 'a'
    boundedEngine.set("a", 100);

    expect(boundedEngine.size()).toBe(2);
    expect(boundedEngine.get("a")).toBe(100);
    expect(boundedEngine.get("b")).toBe(2);
    expect(boundedEngine.info().evictions).toBe(0);
  });
});
