import { CacheEntry, IMemoryStore } from "./types.js";

/**
 * Low-level in-memory key-value store using JavaScript Map.
 *
 * Employs ECMAScript Map insertion-order guarantee to maintain
 * LRU ordering with O(1) complexity for lookups, insertions, and deletions.
 */
export class MemoryStore implements IMemoryStore {
  private readonly store: Map<string, CacheEntry>;

  constructor() {
    this.store = new Map<string, CacheEntry>();
  }

  /**
   * Stores a cache entry.
   * If the key already exists, it is deleted and re-inserted so that
   * it moves to the end of the Map iteration order (Most Recently Used).
   */
  public set(key: string, entry: CacheEntry): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, entry);
  }

  /**
   * Retrieves an entry by key without modifying its access order or accessedAt.
   */
  public get(key: string): CacheEntry | undefined {
    return this.store.get(key);
  }

  /**
   * Updates access metadata and moves the entry to the end of insertion order (MRU).
   * Returns true if the key was found and touched, false otherwise.
   */
  public touch(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    entry.accessedAt = Date.now();
    this.store.delete(key);
    this.store.set(key, entry);
    return true;
  }

  /**
   * Checks whether a key exists in memory.
   */
  public has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Removes an entry by key.
   * Returns true if an entry existed and was removed, false otherwise.
   */
  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clears all entries from the store.
   */
  public clear(): void {
    this.store.clear();
  }

  /**
   * Returns the current number of stored entries.
   */
  public size(): number {
    return this.store.size;
  }

  /**
   * Returns an iterator of all keys in order of least recently updated/touched to most.
   */
  public keys(): IterableIterator<string> {
    return this.store.keys();
  }

  /**
   * Returns an iterator over key-entry pairs in order.
   */
  public entries(): IterableIterator<[string, CacheEntry]> {
    return this.store.entries();
  }

  /**
   * Retrieves the least recently used/inserted key in O(1) time.
   * Returns undefined if the store is empty.
   */
  public getOldestKey(): string | undefined {
    const first = this.store.keys().next();
    return first.done ? undefined : first.value;
  }
}
