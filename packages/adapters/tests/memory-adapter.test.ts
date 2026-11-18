import { describe, it, expect, afterEach } from 'vitest';
import { MemoryAdapter } from '../src/memory/memory-adapter.js';

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  afterEach(async () => {
    if (adapter) {
      await adapter.disconnect();
    }
  });

  it('performs basic CRUD operations', async () => {
    adapter = new MemoryAdapter({ maxSize: 100 });

    expect(await adapter.has('user:1')).toBe(false);
    expect(await adapter.get('user:1')).toBeNull();

    await adapter.set('user:1', { name: 'Alice' });
    expect(await adapter.has('user:1')).toBe(true);

    const entry = await adapter.get<{ name: string }>('user:1');
    expect(entry?.value).toEqual({ name: 'Alice' });

    expect(await adapter.delete('user:1')).toBe(true);
    expect(await adapter.has('user:1')).toBe(false);
    expect(await adapter.delete('user:1')).toBe(false);
  });

  it('handles TTL expiration', async () => {
    adapter = new MemoryAdapter({ maxSize: 100 });

    // Set with 0.1 second TTL (100ms)
    await adapter.set('temp', 'fleeting', { ttl: 0.1 });
    expect(await adapter.has('temp')).toBe(true);

    // Sleep 150ms
    await new Promise((r) => setTimeout(r, 150));

    expect(await adapter.get('temp')).toBeNull();
    expect(await adapter.has('temp')).toBe(false);
  });

  it('supports tag-based invalidation across multiple keys', async () => {
    adapter = new MemoryAdapter({ maxSize: 100 });

    await adapter.set('prod:1', { id: 1 }, { tags: ['electronics', 'phones'] });
    await adapter.set('prod:2', { id: 2 }, { tags: ['electronics', 'laptops'] });
    await adapter.set('prod:3', { id: 3 }, { tags: ['clothing', 'shirts'] });

    expect(await adapter.getSize()).toBe(3);

    // Invalidate all phones
    const phonesDeleted = await adapter.deleteByTag('phones');
    expect(phonesDeleted).toBe(1);
    expect(await adapter.has('prod:1')).toBe(false);
    expect(await adapter.has('prod:2')).toBe(true);
    expect(await adapter.has('prod:3')).toBe(true);

    // Invalidate all electronics
    const electronicsDeleted = await adapter.deleteByTag('electronics');
    expect(electronicsDeleted).toBe(1); // prod:1 was already deleted, prod:2 deleted now
    expect(await adapter.has('prod:2')).toBe(false);
    expect(await adapter.has('prod:3')).toBe(true);
  });

  it('supports scoped namespace clearing', async () => {
    adapter = new MemoryAdapter({ maxSize: 100 });

    await adapter.set('tenantA:user:1', 'Alice');
    await adapter.set('tenantA:user:2', 'Bob');
    await adapter.set('tenantB:user:1', 'Charlie');

    expect(await adapter.getSize()).toBe(3);

    // Clear only tenantA
    await adapter.clear('tenantA');
    expect(await adapter.has('tenantA:user:1')).toBe(false);
    expect(await adapter.has('tenantA:user:2')).toBe(false);
    expect(await adapter.has('tenantB:user:1')).toBe(true);

    // Full clear
    await adapter.clear();
    expect(await adapter.getSize()).toBe(0);
  });

  it('prevents external mutation when cloneStrategy is deep', async () => {
    adapter = new MemoryAdapter({ maxSize: 100, cloneStrategy: 'deep' });

    const originalUser = { name: 'Alice', roles: ['admin', 'user'] };
    await adapter.set('user:alice', originalUser);

    const fetched = await adapter.get<typeof originalUser>('user:alice');
    expect(fetched?.value).toEqual(originalUser);

    // Mutate fetched object
    if (fetched) {
      fetched.value.roles.push('superadmin');
    }

    // Verify stored object remains untouched
    const secondFetch = await adapter.get<typeof originalUser>('user:alice');
    expect(secondFetch?.value.roles).toEqual(['admin', 'user']);
  });

  it('tracks operational statistics correctly', async () => {
    adapter = new MemoryAdapter({ maxSize: 2, policy: 'lru' });

    await adapter.get('nonexistent'); // miss
    await adapter.set('k1', 1);
    await adapter.set('k2', 2);
    await adapter.get('k1'); // hit

    // Adding 3rd item should trigger eviction
    await adapter.set('k3', 3);

    const stats = await adapter.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.evictions).toBe(1);
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(2);
  });

  it('executes batch operations correctly', async () => {
    adapter = new MemoryAdapter({ maxSize: 100 });

    await adapter.setMany([
      { key: 'b1', value: 10 },
      { key: 'b2', value: 20 },
      { key: 'b3', value: 30 },
    ]);

    const results = await adapter.getMany<number>(['b1', 'b2', 'b999']);
    expect(results.size).toBe(2);
    expect(results.get('b1')?.value).toBe(10);
    expect(results.get('b2')?.value).toBe(20);
    expect(results.has('b999')).toBe(false);

    const deleted = await adapter.deleteMany(['b1', 'b2']);
    expect(deleted).toBe(2);
    expect(await adapter.has('b1')).toBe(false);
    expect(await adapter.has('b3')).toBe(true);
  });
});
