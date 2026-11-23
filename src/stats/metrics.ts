export interface CacheStats {
  totalRequests: number;
  hits: number;
  misses: number;
  writes: number;
  deletes: number;
  evictions: number;
  expiredKeys: number;
  currentEntries: number;
  hitRatio: number;
}

/**
 * Tracks operational telemetry for the caching server.
 */
export class MetricsCollector {
  private totalRequests = 0;
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private deletes = 0;
  private evictions = 0;
  private expiredKeys = 0;

  public incrementRequests(): void {
    this.totalRequests++;
  }

  public recordHit(): void {
    this.hits++;
  }

  public recordMiss(): void {
    this.misses++;
  }

  public recordWrite(): void {
    this.writes++;
  }

  public recordDelete(): void {
    this.deletes++;
  }

  public recordEviction(): void {
    this.evictions++;
  }

  public recordExpired(): void {
    this.expiredKeys++;
  }

  /**
   * Calculates hit ratio: hits / (hits + misses).
   * Returns a number between 0.0 and 1.0 (or 0.0 if no read attempts were made).
   */
  public getHitRatio(): number {
    const totalReads = this.hits + this.misses;
    if (totalReads === 0) {
      return 0.0;
    }
    return Number((this.hits / totalReads).toFixed(4));
  }

  /**
   * Returns a snapshot of current metrics.
   */
  public getStats(currentEntries: number): CacheStats {
    return {
      totalRequests: this.totalRequests,
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      deletes: this.deletes,
      evictions: this.evictions,
      expiredKeys: this.expiredKeys,
      currentEntries,
      hitRatio: this.getHitRatio(),
    };
  }

  /**
   * Resets all metrics to zero.
   */
  public reset(): void {
    this.totalRequests = 0;
    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
    this.deletes = 0;
    this.evictions = 0;
    this.expiredKeys = 0;
  }
}
