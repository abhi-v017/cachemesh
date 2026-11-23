import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../../src/engine/memory-store.js";
import { CacheEntry } from "../../src/engine/types.js";

describe("MemoryStore", () => {
  let store: MemoryStore;

  const createEntry = (key: string, value: any, ttlMs: number | null = null): CacheEntry => {
    const now = Date.now();
    return {
      key,
      value,
      createdAt: now,
      accessedAt: now,
      expiresAt: ttlMs ? now + ttlMs : null,
    };
  };

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("should initialize empty", () => {
    expect(store.size()).toBe(0);
    expect(store.getOldestKey()).toBeUndefined();
    expect(Array.from(store.keys())).toEqual([]);
  });

  it("should store and retrieve an entry", () => {
    const entry = createEntry("user:1", { name: "Alice" });
    store.set("user:1", entry);

    expect(store.size()).toBe(1);
    expect(store.has("user:1")).toBe(true);
    expect(store.get("user:1")).toBe(entry);
    expect(store.get("user:1")?.value).toEqual({ name: "Alice" });
  });

  it("should support diverse value types (numbers, booleans, arrays, null, objects)", () => {
    store.set("num", createEntry("num", 42));
    store.set("bool", createEntry("bool", true));
    store.set("arr", createEntry("arr", [1, "two", false]));
    store.set("nullVal", createEntry("nullVal", null));
    store.set("obj", createEntry("obj", { nested: { val: 123 } }));

    expect(store.get("num")?.value).toBe(42);
    expect(store.get("bool")?.value).toBe(true);
    expect(store.get("arr")?.value).toEqual([1, "two", false]);
    expect(store.get("nullVal")?.value).toBeNull();
    expect(store.get("obj")?.value).toEqual({ nested: { val: 123 } });
  });

  it("should overwrite existing key and move it to most recently used position", () => {
    store.set("k1", createEntry("k1", "v1"));
    store.set("k2", createEntry("k2", "v2"));
    store.set("k3", createEntry("k3", "v3"));

    // Initial order: k1 (oldest), k2, k3 (newest)
    expect(Array.from(store.keys())).toEqual(["k1", "k2", "k3"]);
    expect(store.getOldestKey()).toBe("k1");

    // Overwrite k1
    const updatedK1 = createEntry("k1", "v1-updated");
    store.set("k1", updatedK1);

    // New order: k2 (oldest), k3, k1 (newest)
    expect(Array.from(store.keys())).toEqual(["k2", "k3", "k1"]);
    expect(store.getOldestKey()).toBe("k2");
    expect(store.get("k1")?.value).toBe("v1-updated");
  });

  it("should delete an entry", () => {
    store.set("k1", createEntry("k1", "v1"));
    expect(store.delete("k1")).toBe(true);
    expect(store.has("k1")).toBe(false);
    expect(store.get("k1")).toBeUndefined();
    expect(store.size()).toBe(0);

    // Deleting non-existent key returns false
    expect(store.delete("non-existent")).toBe(false);
  });

  it("should touch an entry and move it to MRU", async () => {
    store.set("k1", createEntry("k1", "v1"));
    store.set("k2", createEntry("k2", "v2"));
    store.set("k3", createEntry("k3", "v3"));

    expect(Array.from(store.keys())).toEqual(["k1", "k2", "k3"]);
    expect(store.getOldestKey()).toBe("k1");

    // Wait a millisecond to ensure accessedAt changes
    await new Promise((resolve) => setTimeout(resolve, 5));

    const initialAccessedAt = store.get("k1")!.accessedAt;
    const touched = store.touch("k1");

    expect(touched).toBe(true);
    // k1 should now be at the end (MRU)
    expect(Array.from(store.keys())).toEqual(["k2", "k3", "k1"]);
    expect(store.getOldestKey()).toBe("k2");
    expect(store.get("k1")!.accessedAt).toBeGreaterThanOrEqual(initialAccessedAt);
  });

  it("should return false when touching a non-existent key", () => {
    expect(store.touch("non-existent")).toBe(false);
  });

  it("should clear all entries", () => {
    store.set("k1", createEntry("k1", "v1"));
    store.set("k2", createEntry("k2", "v2"));
    expect(store.size()).toBe(2);

    store.clear();
    expect(store.size()).toBe(0);
    expect(store.getOldestKey()).toBeUndefined();
    expect(store.has("k1")).toBe(false);
  });

  it("should correctly iterate over entries", () => {
    store.set("a", createEntry("a", 1));
    store.set("b", createEntry("b", 2));

    const entries = Array.from(store.entries());
    expect(entries.length).toBe(2);
    expect(entries[0]![0]).toBe("a");
    expect(entries[0]![1].value).toBe(1);
    expect(entries[1]![0]).toBe("b");
    expect(entries[1]![1].value).toBe(2);
  });
});
