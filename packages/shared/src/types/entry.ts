/**
 * Represents a cached entry in CacheMesh.
 */
export interface CacheEntry<T = unknown> {
  /** The unique key of this cache entry (namespaced if configured). */
  key: string;
  /** The stored payload value. */
  value: T;
  /**
   * Absolute timestamp (epoch milliseconds) when this entry expires.
   * `null` means the entry never expires.
   */
  expiresAt: number | null;
  /** Timestamp (epoch milliseconds) when this entry was created or last updated. */
  createdAt: number;
  /** Optional tags associated with this entry for bulk tag-based invalidation. */
  tags?: string[];
  /** Entry version or generation counter for optimistic concurrency and cache coherence. */
  version?: number;
}
