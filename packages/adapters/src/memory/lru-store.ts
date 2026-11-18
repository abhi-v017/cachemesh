import type { CacheEntry } from '@cachemesh/shared';
import { isExpired } from '@cachemesh/shared';
import { DoublyLinkedList, ListNode } from './doubly-linked-list.js';

export interface EvictionResult<T> {
  key: string;
  entry: CacheEntry<T>;
}

/**
 * High-performance O(1) LRU (Least Recently Used) cache store.
 * Uses a Hash Map combined with a Doubly-Linked List.
 */
export class LRUStore {
  private readonly map = new Map<string, ListNode<CacheEntry<unknown>>>();
  private readonly list = new DoublyLinkedList<CacheEntry<unknown>>();
  public readonly maxSize: number;

  constructor(maxSize = 1000) {
    if (maxSize <= 0) {
      throw new Error(`LRUStore maxSize must be greater than 0, received ${maxSize}`);
    }
    this.maxSize = maxSize;
  }

  public get size(): number {
    return this.map.size;
  }

  /**
   * Retrieves an entry and promotes it to the most recently used position.
   * Returns null if key is not found or has expired.
   */
  public get<T>(key: string, now = Date.now()): CacheEntry<T> | null {
    const node = this.map.get(key);
    if (!node) {
      return null;
    }

    const entry = node.value as CacheEntry<T>;
    if (isExpired(entry.expiresAt, now)) {
      this.delete(key);
      return null;
    }

    this.list.moveToFront(node);
    return entry;
  }

  /**
   * Retrieves an entry without modifying the LRU order (for non-mutating inspection).
   */
  public peek<T>(key: string, now = Date.now()): CacheEntry<T> | null {
    const node = this.map.get(key);
    if (!node) {
      return null;
    }

    const entry = node.value as CacheEntry<T>;
    if (isExpired(entry.expiresAt, now)) {
      this.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Inserts or updates an entry.
   * If capacity is exceeded, evicts the least recently used entry.
   * Returns the evicted entry if one was evicted, or null otherwise.
   */
  public set<T>(key: string, entry: CacheEntry<T>): EvictionResult<unknown> | null {
    let evicted: EvictionResult<unknown> | null = null;
    const existingNode = this.map.get(key);

    if (existingNode) {
      existingNode.value = entry as CacheEntry<unknown>;
      this.list.moveToFront(existingNode);
      return null;
    }

    // Check if at capacity before adding new entry
    if (this.map.size >= this.maxSize) {
      const tailNode = this.list.popBack();
      if (tailNode) {
        this.map.delete(tailNode.key);
        evicted = {
          key: tailNode.key,
          entry: tailNode.value,
        };
      }
    }

    const newNode = new ListNode<CacheEntry<unknown>>(key, entry as CacheEntry<unknown>);
    this.list.pushFront(newNode);
    this.map.set(key, newNode);

    return evicted;
  }

  /**
   * Deletes an entry by key.
   */
  public delete(key: string): boolean {
    const node = this.map.get(key);
    if (!node) {
      return false;
    }

    this.list.remove(node);
    this.map.delete(key);
    return true;
  }

  /**
   * Checks whether a non-expired entry exists for the given key.
   */
  public has(key: string, now = Date.now()): boolean {
    return this.get(key, now) !== null;
  }

  /**
   * Clears all entries from the store.
   */
  public clear(): void {
    this.list.clear();
    this.map.clear();
  }

  /**
   * Returns an iterator over all stored keys.
   */
  public keys(): IterableIterator<string> {
    return this.map.keys();
  }

  /**
   * Returns an array of random sampled keys for background TTL reaping.
   */
  public sampleKeys(count: number): string[] {
    const sampled: string[] = [];
    const keysArray = Array.from(this.map.keys());
    const total = keysArray.length;
    if (total === 0) {
      return sampled;
    }

    const sampleCount = Math.min(count, total);
    // Fisher-Yates sample or randomized selection
    for (let i = 0; i < sampleCount; i++) {
      const randomIndex = Math.floor(Math.random() * total);
      const k = keysArray[randomIndex];
      if (k !== undefined) {
        sampled.push(k);
      }
    }
    return sampled;
  }
}
