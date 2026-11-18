import { describe, it, expect } from 'vitest';
import { LFUStore } from '../src/memory/lfu-store.js';
import type { CacheEntry } from '@cachemesh/shared';

function createEntry<T>(key: string, value: T): CacheEntry<T> {
  return {
    key,
    value,
    createdAt: Date.now(),
    expiresAt: null,
  };
}

describe('LFUStore', () => {
  it('enforces maximum capacity with strict LFU eviction', () => {
    const lfu = new LFUStore(3);

    lfu.set('k1', createEntry('k1', 'val1'));
    lfu.set('k2', createEntry('k2', 'val2'));
    lfu.set('k3', createEntry('k3', 'val3'));

    // Access k1 three times (freq = 4)
    lfu.get('k1');
    lfu.get('k1');
    lfu.get('k1');

    // Access k2 once (freq = 2)
    lfu.get('k2');

    // k3 was never accessed after insertion (freq = 1)
    // Adding k4 should evict k3 (lowest frequency)
    const evicted = lfu.set('k4', createEntry('k4', 'val4'));
    expect(evicted?.key).toBe('k3');

    expect(lfu.get('k3')).toBeNull();
    expect(lfu.get('k1')?.value).toBe('val1');
    expect(lfu.get('k2')?.value).toBe('val2');
    expect(lfu.get('k4')?.value).toBe('val4');
  });

  it('breaks ties in frequency by evicting least recently used among equal frequency', () => {
    const lfu = new LFUStore(2);

    lfu.set('a', createEntry('a', 1));
    lfu.set('b', createEntry('b', 2));

    // Both 'a' and 'b' have frequency = 1. 'a' was inserted before 'b', so 'a' is older.
    // Adding 'c' should evict 'a'.
    const evicted = lfu.set('c', createEntry('c', 3));
    expect(evicted?.key).toBe('a');

    expect(lfu.get('a')).toBeNull();
    expect(lfu.get('b')?.value).toBe(2);
    expect(lfu.get('c')?.value).toBe(3);
  });

  it('updates existing keys and increments their frequency', () => {
    const lfu = new LFUStore(2);
    lfu.set('x', createEntry('x', 10));
    lfu.set('y', createEntry('y', 20));

    // Overwriting 'x' increments frequency of 'x'
    lfu.set('x', createEntry('x', 99));

    // Now 'x' has higher frequency than 'y'. Adding 'z' should evict 'y'.
    const evicted = lfu.set('z', createEntry('z', 30));
    expect(evicted?.key).toBe('y');
    expect(lfu.get('x')?.value).toBe(99);
  });
});
