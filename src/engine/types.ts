/**
 * Supported JSON-compatible cache value types.
 */
export type CacheValue =
  string | number | boolean | null | { [key: string]: CacheValue } | CacheValue[];

/**
 * Internal representation of an item stored in memory.
 */
export interface CacheEntry<T = CacheValue> {
  readonly key: string;
  value: T;
  createdAt: number;
  accessedAt: number;
  expiresAt: number | null;
}

/**
 * Options for writing a key to the cache.
 */
export interface SetOptions {
  /** Time to live in seconds. If omitted or undefined, entry does not expire. */
  ttl?: number;
}

/**
 * Interface defining the contract for low-level in-memory storage.
 */
export interface IMemoryStore {
  set(key: string, entry: CacheEntry): void;
  get(key: string): CacheEntry | undefined;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  keys(): IterableIterator<string>;
  entries(): IterableIterator<[string, CacheEntry]>;
  getOldestKey(): string | undefined;
  touch(key: string): boolean;
}
