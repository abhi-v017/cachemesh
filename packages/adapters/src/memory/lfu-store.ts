import type { CacheEntry } from '@cachemesh/shared';
import { isExpired } from '@cachemesh/shared';
import { DoublyLinkedList, ListNode } from './doubly-linked-list.js';
import type { EvictionResult } from './lru-store.js';

interface LFUEntry<T> {
  key: string;
  entry: CacheEntry<T>;
  frequency: number;
}

/**
 * High-performance O(1) LFU (Least Frequently Used) cache store.
 * Uses a Key Map + Frequency Bucket Doubly-Linked Lists with an O(1) minimum frequency tracker.
 */
export class LFUStore {
  private readonly keyToNode = new Map<string, ListNode<LFUEntry<unknown>>>();
  private readonly freqToList = new Map<number, DoublyLinkedList<LFUEntry<unknown>>>();
  private minFreq = 1;
  public readonly maxSize: number;

  constructor(maxSize = 1000) {
    if (maxSize <= 0) {
      throw new Error(`LFUStore maxSize must be greater than 0, received ${maxSize}`);
    }
    this.maxSize = maxSize;
  }

  public get size(): number {
    return this.keyToNode.size;
  }

  /**
   * Retrieves an entry and increments its access frequency in O(1) time.
   */
  public get<T>(key: string, now = Date.now()): CacheEntry<T> | null {
    const node = this.keyToNode.get(key);
    if (!node) {
      return null;
    }

    const entry = node.value.entry as CacheEntry<T>;
    if (isExpired(entry.expiresAt, now)) {
      this.delete(key);
      return null;
    }

    this.incrementFrequency(node);
    return entry;
  }

  /**
   * Peeks an entry without incrementing its frequency count.
   */
  public peek<T>(key: string, now = Date.now()): CacheEntry<T> | null {
    const node = this.keyToNode.get(key);
    if (!node) {
      return null;
    }

    const entry = node.value.entry as CacheEntry<T>;
    if (isExpired(entry.expiresAt, now)) {
      this.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Inserts or updates an entry. If capacity is exceeded, evicts the least frequently used entry.
   * If there is a tie in frequency, the least recently used among that frequency bucket is evicted.
   */
  public set<T>(key: string, entry: CacheEntry<T>): EvictionResult<unknown> | null {
    let evicted: EvictionResult<unknown> | null = null;
    const existingNode = this.keyToNode.get(key);

    if (existingNode) {
      existingNode.value.entry = entry as CacheEntry<unknown>;
      this.incrementFrequency(existingNode);
      return null;
    }

    // If at capacity, evict least frequently used
    if (this.keyToNode.size >= this.maxSize) {
      const minList = this.freqToList.get(this.minFreq);
      if (minList && !minList.isEmpty()) {
        const victimNode = minList.popBack();
        if (victimNode) {
          this.keyToNode.delete(victimNode.value.key);
          evicted = {
            key: victimNode.value.key,
            entry: victimNode.value.entry,
          };
        }
      }
    }

    // Insert new item with frequency = 1
    const lfuData: LFUEntry<unknown> = {
      key,
      entry: entry as CacheEntry<unknown>,
      frequency: 1,
    };
    const newNode = new ListNode<LFUEntry<unknown>>(key, lfuData);

    let list1 = this.freqToList.get(1);
    if (!list1) {
      list1 = new DoublyLinkedList<LFUEntry<unknown>>();
      this.freqToList.set(1, list1);
    }

    list1.pushFront(newNode);
    this.keyToNode.set(key, newNode);
    this.minFreq = 1;

    return evicted;
  }

  /**
   * Deletes an entry by key.
   */
  public delete(key: string): boolean {
    const node = this.keyToNode.get(key);
    if (!node) {
      return false;
    }

    const freq = node.value.frequency;
    const list = this.freqToList.get(freq);
    if (list) {
      list.remove(node);
      if (list.isEmpty() && this.minFreq === freq) {
        // If the minFreq bucket became empty, we don't necessarily have to advance minFreq
        // unless an eviction is needed, which will find the next lowest frequency.
      }
    }

    this.keyToNode.delete(key);
    return true;
  }

  public has(key: string, now = Date.now()): boolean {
    return this.get(key, now) !== null;
  }

  public clear(): void {
    this.keyToNode.clear();
    this.freqToList.clear();
    this.minFreq = 1;
  }

  public keys(): IterableIterator<string> {
    return this.keyToNode.keys();
  }

  public sampleKeys(count: number): string[] {
    const sampled: string[] = [];
    const keysArray = Array.from(this.keyToNode.keys());
    const total = keysArray.length;
    if (total === 0) {
      return sampled;
    }

    const sampleCount = Math.min(count, total);
    for (let i = 0; i < sampleCount; i++) {
      const randomIndex = Math.floor(Math.random() * total);
      const k = keysArray[randomIndex];
      if (k !== undefined) {
        sampled.push(k);
      }
    }
    return sampled;
  }

  private incrementFrequency(node: ListNode<LFUEntry<unknown>>): void {
    const currentFreq = node.value.frequency;
    const nextFreq = currentFreq + 1;

    const currentList = this.freqToList.get(currentFreq);
    if (currentList) {
      currentList.remove(node);
      if (currentList.isEmpty()) {
        this.freqToList.delete(currentFreq);
        if (this.minFreq === currentFreq) {
          this.minFreq = nextFreq;
        }
      }
    }

    node.value.frequency = nextFreq;

    let nextList = this.freqToList.get(nextFreq);
    if (!nextList) {
      nextList = new DoublyLinkedList<LFUEntry<unknown>>();
      this.freqToList.set(nextFreq, nextList);
    }
    nextList.pushFront(node);
  }
}
