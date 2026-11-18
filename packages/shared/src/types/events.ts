export type CacheEventMap = {
  'hit': { key: string; layer: string; latencyMs: number };
  'miss': { key: string; latencyMs: number };
  'set': { key: string; layer: string; ttl?: number; latencyMs: number };
  'delete': { key: string; layer: string };
  'clear': { namespace?: string };
  'evict': { key: string; reason: 'lru' | 'lfu' | 'capacity'; layer: string };
  'expire': { key: string; layer: string };
  'error': { error: Error; layer?: string; key?: string };
};

export type CacheEventName = keyof CacheEventMap;
