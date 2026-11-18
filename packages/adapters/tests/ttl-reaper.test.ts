import { describe, it, expect } from 'vitest';
import { TTLReaper, type TTLReaperTarget } from '../src/memory/ttl-reaper.js';

describe('TTLReaper', () => {
  it('actively sweeps and reaps expired keys based on target callbacks', () => {
    const database = new Map<string, { value: number; expired: boolean }>();
    database.set('k1', { value: 1, expired: true });
    database.set('k2', { value: 2, expired: false });
    database.set('k3', { value: 3, expired: true });
    database.set('k4', { value: 4, expired: false });

    const expiredList: string[] = [];

    const mockTarget: TTLReaperTarget = {
      sampleKeys: () => Array.from(database.keys()),
      checkAndExpire: (key: string) => {
        const item = database.get(key);
        if (item && item.expired) {
          database.delete(key);
          return true;
        }
        return false;
      },
    };

    const reaper = new TTLReaper(mockTarget, {
      sampleSize: 10,
      onExpired: (k) => expiredList.push(k),
    });

    const reapedCount = reaper.sweep();
    expect(reapedCount).toBe(2);
    expect(reaper.totalReaped).toBe(2);
    expect(expiredList.sort()).toEqual(['k1', 'k3']);
    expect(database.has('k1')).toBe(false);
    expect(database.has('k3')).toBe(false);
    expect(database.has('k2')).toBe(true);
    expect(database.has('k4')).toBe(true);
  });

  it('starts and stops gracefully', () => {
    const mockTarget: TTLReaperTarget = {
      sampleKeys: () => [],
      checkAndExpire: () => false,
    };

    const reaper = new TTLReaper(mockTarget, { intervalMs: 50 });
    expect(reaper.isRunning).toBe(false);

    reaper.start();
    expect(reaper.isRunning).toBe(true);

    // Idempotent start
    reaper.start();
    expect(reaper.isRunning).toBe(true);

    reaper.stop();
    expect(reaper.isRunning).toBe(false);
  });
});
