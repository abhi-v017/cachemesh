import { describe, it, expect, afterEach } from 'vitest';
import { CacheEngine } from '../src/engine/cache-engine.js';
import { MemoryAdapter } from '@cachemesh/adapters';
import { LocalInvalidationBus } from '../src/invalidation/invalidation-bus.js';

describe('CacheEngine (Multi-Level)', () => {
  let engine: CacheEngine;
  let l1: MemoryAdapter;
  let l2: MemoryAdapter;

  afterEach(async () => {
    if (engine) {
      await engine.disconnect();
    }
  });

  it('reads from L1 if available, avoiding L2 lookup', async () => {
    l1 = new MemoryAdapter({ name: 'l1', maxSize: 50 });
    l2 = new MemoryAdapter({ name: 'l2', maxSize: 500 });

    engine = new CacheEngine({
      layers: [
        { name: 'l1', adapter: l1, priority: 10 },
        { name: 'l2', adapter: l2, priority: 5 },
      ],
    });

    // Populate L1 only
    await l1.set('item:1', 'from_l1');

    const value = await engine.get('item:1');
    expect(value).toBe('from_l1');

    // L2 should never have been touched
    expect(await l2.has('item:1')).toBe(false);
  });

  it('backfills L1 when item is found in L2', async () => {
    l1 = new MemoryAdapter({ name: 'l1', maxSize: 50 });
    l2 = new MemoryAdapter({ name: 'l2', maxSize: 500 });

    engine = new CacheEngine({
      layers: [
        { name: 'l1', adapter: l1, priority: 10 },
        { name: 'l2', adapter: l2, priority: 5 },
      ],
    });

    // Populate L2 only
    await l2.set('item:42', { name: 'Superwidget' }, { ttl: 60 });

    expect(await l1.has('item:42')).toBe(false);

    // Read through engine
    const val = await engine.get<{ name: string }>('item:42');
    expect(val).toEqual({ name: 'Superwidget' });

    // L1 must now be automatically populated (backfilled)!
    // Wait tiny microtick for async backfill promise
    await new Promise((r) => setTimeout(r, 20));
    expect(await l1.has('item:42')).toBe(true);
    const l1Entry = await l1.get<{ name: string }>('item:42');
    expect(l1Entry?.value).toEqual({ name: 'Superwidget' });
  });

  it('writes through to all layers', async () => {
    l1 = new MemoryAdapter({ name: 'l1', maxSize: 50 });
    l2 = new MemoryAdapter({ name: 'l2', maxSize: 500 });

    engine = new CacheEngine({
      layers: [
        { name: 'l1', adapter: l1, priority: 10 },
        { name: 'l2', adapter: l2, priority: 5 },
      ],
    });

    await engine.set('config:theme', 'dark');

    expect(await l1.has('config:theme')).toBe(true);
    expect(await l2.has('config:theme')).toBe(true);
  });

  it('executes factory once during concurrent getOrSet calls', async () => {
    l1 = new MemoryAdapter({ name: 'l1', maxSize: 50 });
    engine = new CacheEngine({
      layers: [{ name: 'l1', adapter: l1 }],
    });

    let factoryInvocations = 0;
    const fetchExpensiveData = async () => {
      factoryInvocations++;
      await new Promise((r) => setTimeout(r, 40));
      return { reportId: 999 };
    };

    // 25 simultaneous getOrSet calls
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        engine.getOrSet('report:monthly', fetchExpensiveData)
      )
    );

    expect(factoryInvocations).toBe(1);
    for (const res of results) {
      expect(res).toEqual({ reportId: 999 });
    }

    // Next getOrSet should hit cache immediately without factory call
    const cached = await engine.getOrSet('report:monthly', fetchExpensiveData);
    expect(cached).toEqual({ reportId: 999 });
    expect(factoryInvocations).toBe(1);
  });

  it('emits operational events for hits, misses, sets, and deletes', async () => {
    l1 = new MemoryAdapter({ name: 'l1', maxSize: 50 });
    engine = new CacheEngine({
      layers: [{ name: 'l1', adapter: l1 }],
    });

    const events: string[] = [];
    engine.on('hit', (e) => events.push(`hit:${e.key}`));
    engine.on('miss', (e) => events.push(`miss:${e.key}`));
    engine.on('set', (e) => events.push(`set:${e.key}`));
    engine.on('delete', (e) => events.push(`delete:${e.key}`));

    await engine.get('missing');
    await engine.set('existing', 123);
    await engine.get('existing');
    await engine.delete('existing');

    expect(events).toEqual([
      'miss:missing',
      'set:existing',
      'hit:existing',
      'delete:existing',
    ]);
  });

  it('handles distributed invalidation messages from peer instances', async () => {
    const sharedBus = new LocalInvalidationBus();

    const l1A = new MemoryAdapter({ name: 'l1-A' });
    const engineA = new CacheEngine({
      instanceId: 'inst-A',
      invalidationBus: sharedBus,
      layers: [{ name: 'l1-A', adapter: l1A }],
    });

    const l1B = new MemoryAdapter({ name: 'l1-B' });
    const engineB = new CacheEngine({
      instanceId: 'inst-B',
      invalidationBus: sharedBus,
      layers: [{ name: 'l1-B', adapter: l1B }],
    });

    // Populate both instances
    await engineA.set('sharedKey', 'v1');
    await engineB.set('sharedKey', 'v1');

    expect(await engineA.has('sharedKey')).toBe(true);
    expect(await engineB.has('sharedKey')).toBe(true);

    // Instance A deletes the key with broadcast
    await engineA.delete('sharedKey');

    // Instance B's local cache should have received the invalidation message and dropped it
    await new Promise((r) => setTimeout(r, 30));
    expect(await engineB.has('sharedKey')).toBe(false);

    await engineA.disconnect();
    await engineB.disconnect();
  });
});
