import { describe, it, expect } from 'vitest';
import { LRUStore } from '../src/memory/lru-store.js';
import type { CacheEntry } from '@cachemesh/shared';

function createEntry<T>(key: string, value: T, ttlSec?: number): CacheEntry<T> {
  return {
    key,
    value,
    createdAt: Date.now(),
    expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null,
  };
}

describe('LRUStore', () => {
  it('enforces maximum capacity with strict LRU eviction', () => {
    const lru = new LRUStore(3);

    lru.set('k1', createEntry('k1', 'val1'));
    lru.set('k2', createEntry('k2', 'val2'));
    lru.set('k3', createEntry('k3', 'val3'));
    expect(lru.size).toBe(3);

    // Access k1 so it becomes most recently used. Order MRU -> LRU is now: k1, k3, k2
    expect(lru.get('k1')?.value).toBe('val1');

    // Adding k4 should evict k2 (which is the least recently used)
    const evicted = lru.set('k4', createEntry('k4', 'val4'));
    expect(evicted?.key).toBe('k2');
    expect(lru.size).toBe(3);

    expect(lru.get('k2')).toBeNull();
    expect(lru.get('k1')?.value).toBe('val1');
    expect(lru.get('k3')?.value).toBe('val3');
    expect(lru.get('k4')?.value).toBe('val4');
  });

  it('peek retrieves value without changing LRU access order', () => {
    const lru = new LRUStore(2);

    lru.set('a', createEntry('a', 1));
    lru.set('b', createEntry('b', 2));

    // Peek 'a' - does not update recency
    expect(lru.peek('a')?.value).toBe(1);

    // Setting 'c' should evict 'a' because 'a' was not promoted by peek
    const evicted = lru.set('c', createEntry('c', 3));
    expect(evicted?.key).toBe('a');

    expect(lru.get('a')).toBeNull();
    expect(lru.get('b')?.value).toBe(2);
    expect(lru.get('c')?.value).toBe(3);
  });

  it('lazily expires items on get', () => {
    const lru = new LRUStore(10);
    const now = Date.now();

    // Key with expiration in the past
    lru.set('expiredKey', {
      key: 'expiredKey',
      value: 'dead',
      createdAt: now - 5000,
      expiresAt: now - 1000,
    });

    expect(lru.size).toBe(1);
    // Reading expired key should return null and delete it
    expect(lru.get('expiredKey', now)).toBeNull();
    expect(lru.size).toBe(0);
  });

  it('updates existing keys in-place without exceeding capacity', () => {
    const lru = new LRUStore(2);
    lru.set('a', createEntry('a', 1));
    lru.set('b', createEntry('b', 2));

    const evicted = lru.set('a', createEntry('a', 100));
    expect(evicted).toBeNull();
    expect(lru.size).toBe(2);
    expect(lru.get('a')?.value).toBe(100);
  });

  it('samples random keys correctly for reaping', () => {
    const lru = new LRUStore(10);
    for (let i = 0; i < 5; i++) {
      lru.set(`k${i}`, createEntry(`k${i}`, i));
    }

    const sample = lru.sampleKeys(3);
    expect(sample.length).toBe(3);
    for (const k of sample) {
      expect(lru.has(k)).toBe(true);
    }
  });
});
