import { describe, it, expect } from 'vitest';
import { Singleflight } from '../src/coalescing/singleflight.js';
import { TimeoutError } from '@cachemesh/shared';

describe('Singleflight', () => {
  it('coalesces multiple concurrent executions into exactly one invocation', async () => {
    const sf = new Singleflight();
    let executionCount = 0;

    const factory = async () => {
      executionCount++;
      // Simulate asynchronous latency
      await new Promise((r) => setTimeout(r, 50));
      return { data: 'heavy_database_result' };
    };

    // Dispatch 50 concurrent requests for the exact same key
    const promises = Array.from({ length: 50 }, () => sf.execute('products:hot', factory));

    const results = await Promise.all(promises);

    expect(executionCount).toBe(1);
    expect(results.length).toBe(50);
    for (const res of results) {
      expect(res).toEqual({ data: 'heavy_database_result' });
    }
    expect(sf.activeCount).toBe(0);
  });

  it('runs separate keys independently in parallel', async () => {
    const sf = new Singleflight();
    let countA = 0;
    let countB = 0;

    const [resA, resB] = await Promise.all([
      sf.execute('keyA', async () => {
        countA++;
        return 'resultA';
      }),
      sf.execute('keyB', async () => {
        countB++;
        return 'resultB';
      }),
    ]);

    expect(resA).toBe('resultA');
    expect(resB).toBe('resultB');
    expect(countA).toBe(1);
    expect(countB).toBe(1);
    expect(sf.activeCount).toBe(0);
  });

  it('does not poison subsequent requests when a factory execution fails', async () => {
    const sf = new Singleflight();
    let callCount = 0;

    const failingFactory = async () => {
      callCount++;
      throw new Error('Database connection failed');
    };

    // First concurrent batch fails
    await expect(
      Promise.all([
        sf.execute('brokenKey', failingFactory),
        sf.execute('brokenKey', failingFactory),
      ])
    ).rejects.toThrow('Database connection failed');

    expect(callCount).toBe(1);
    expect(sf.activeCount).toBe(0);

    // Subsequent request should not receive a cached failure and can retry
    const recovered = await sf.execute('brokenKey', async () => {
      return 'recovered';
    });
    expect(recovered).toBe('recovered');
  });

  it('enforces execution timeout', async () => {
    const sf = new Singleflight();

    const slowFactory = async () => {
      await new Promise((r) => setTimeout(r, 200));
      return 'too late';
    };

    await expect(sf.execute('slowKey', slowFactory, 50)).rejects.toThrow(TimeoutError);
    expect(sf.activeCount).toBe(0);
  });
});
