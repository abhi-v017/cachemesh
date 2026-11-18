import { describe, it, expect, afterEach } from 'vitest';
import { createCache, type CacheClient, KeyValidationError } from '../src/index.js';

describe('CacheMesh SDK', () => {
  let cache: CacheClient;

  afterEach(async () => {
    if (cache) {
      await cache.disconnect();
    }
  });

  it('provides instant zero-config caching', async () => {
    cache = createCache();

    expect(await cache.get('greeting')).toBeNull();
    await cache.set('greeting', 'Hello World!');

    expect(await cache.has('greeting')).toBe(true);
    expect(await cache.get<string>('greeting')).toBe('Hello World!');

    expect(await cache.delete('greeting')).toBe(true);
    expect(await cache.get('greeting')).toBeNull();
  });

  it('supports namespaced isolation', async () => {
    const cacheA = createCache({ namespace: 'tenantA' });
    const cacheB = createCache({ namespace: 'tenantB' });

    await cacheA.set('profile', { user: 'Alice' });
    await cacheB.set('profile', { user: 'Bob' });

    expect(await cacheA.get<{ user: string }>('profile')).toEqual({ user: 'Alice' });
    expect(await cacheB.get<{ user: string }>('profile')).toEqual({ user: 'Bob' });

    await cacheA.clear();
    expect(await cacheA.get('profile')).toBeNull();
    expect(await cacheB.get<{ user: string }>('profile')).toEqual({ user: 'Bob' });

    await cacheA.disconnect();
    await cacheB.disconnect();
  });

  it('wraps async functions for transparent memoization', async () => {
    cache = createCache();
    let queryCount = 0;

    const findUserById = async (id: number) => {
      queryCount++;
      return { id, name: `User_${id}` };
    };

    const getCachedUser = cache.wrap(
      (id: number) => `user:${id}`,
      findUserById,
      { ttl: 60 }
    );

    const user1 = await getCachedUser(101);
    const user2 = await getCachedUser(101);
    const user3 = await getCachedUser(202);

    expect(user1).toEqual({ id: 101, name: 'User_101' });
    expect(user2).toEqual({ id: 101, name: 'User_101' });
    expect(user3).toEqual({ id: 202, name: 'User_202' });
    expect(queryCount).toBe(2); // Only called for 101 once, and for 202 once
  });

  it('invalidates by tag', async () => {
    cache = createCache();

    await cache.set('post:1', { title: 'First Post' }, { tags: ['posts', 'author:1'] });
    await cache.set('post:2', { title: 'Second Post' }, { tags: ['posts', 'author:2'] });
    await cache.set('author:1', { name: 'Alice' }, { tags: ['authors'] });

    expect(await cache.has('post:1')).toBe(true);
    expect(await cache.has('post:2')).toBe(true);

    // Invalidate author:1 posts
    const deletedCount = await cache.invalidateTag('author:1');
    expect(deletedCount).toBe(1);

    expect(await cache.has('post:1')).toBe(false);
    expect(await cache.has('post:2')).toBe(true);
    expect(await cache.has('author:1')).toBe(true);
  });

  it('rejects empty or invalid keys', async () => {
    cache = createCache();

    await expect(cache.set('', 'value')).rejects.toThrow(KeyValidationError);
    await expect(cache.get('   ')).rejects.toThrow(KeyValidationError);
    await expect(cache.get(123 as unknown as string)).rejects.toThrow(KeyValidationError);
  });

  it('exposes operational statistics', async () => {
    cache = createCache();

    await cache.get('unknown');
    await cache.set('counter', 42);
    await cache.get('counter');

    const stats = await cache.getStats();
    expect(stats.inFlightRequests).toBe(0);
    expect(stats.layers['memory-l1']).toBeDefined();
    expect(stats.layers['memory-l1']?.hits).toBe(1);
    expect(stats.layers['memory-l1']?.misses).toBe(1);
    expect(stats.layers['memory-l1']?.size).toBe(1);
  });
});
