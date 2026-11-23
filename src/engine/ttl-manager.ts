import { CacheEntry, IMemoryStore } from "./types.js";
import { MetricsCollector } from "../stats/metrics.js";

export interface TTLManagerOptions {
  /** How often the periodic sweep runs in milliseconds. Default: 1000ms */
  sweepIntervalMs?: number;
  /** Maximum number of keys to check per sweep pass. Default: 100 */
  maxSweepBatchSize?: number;
  /** Automatically start the periodic sweep timer on creation. Default: false */
  autoStart?: boolean;
}

/**
 * Manages key expiration using dual strategies:
 * 1. Passive / Lazy expiration on key access.
 * 2. Active / Periodic background sweeping of expired keys.
 */
export class TTLManager {
  private readonly store: IMemoryStore;
  private readonly metrics: MetricsCollector;
  private readonly sweepIntervalMs: number;
  private readonly maxSweepBatchSize: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(store: IMemoryStore, metrics: MetricsCollector, options: TTLManagerOptions = {}) {
    this.store = store;
    this.metrics = metrics;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 1000;
    this.maxSweepBatchSize = options.maxSweepBatchSize ?? 100;

    if (options.autoStart) {
      this.start();
    }
  }

  /**
   * Determines whether a given entry has expired based on current timestamp.
   */
  public isExpired(entry: CacheEntry): boolean {
    if (entry.expiresAt === null) {
      return false;
    }
    return Date.now() >= entry.expiresAt;
  }

  /**
   * Checks an entry for expiration. If expired, removes it from the store,
   * increments expired metrics, and returns true.
   * If not expired, returns false.
   */
  public checkAndExpire(key: string, entry: CacheEntry): boolean {
    if (this.isExpired(entry)) {
      this.store.delete(key);
      this.metrics.recordExpired();
      return true;
    }
    return false;
  }

  /**
   * Runs an active sweep pass over a batch of keys in the store,
   * removing any expired keys found.
   *
   * Returns the count of expired keys removed during this pass.
   */
  public sweep(): number {
    let expiredCount = 0;
    let checkedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (checkedCount >= this.maxSweepBatchSize) {
        break;
      }
      checkedCount++;

      if (this.checkAndExpire(key, entry)) {
        expiredCount++;
      }
    }

    return expiredCount;
  }

  /**
   * Starts the background periodic cleanup timer.
   * Calls timer.unref() so this background timer does not hold open the Node.js event loop.
   */
  public start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.sweep();
    }, this.sweepIntervalMs);

    // Ensure the background timer does not prevent the Node process from exiting
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  /**
   * Stops the background periodic cleanup timer cleanly.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Returns whether the periodic sweep timer is currently running.
   */
  public isRunning(): boolean {
    return this.timer !== null;
  }
}
