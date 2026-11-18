export interface TTLReaperTarget {
  sampleKeys(count: number): string[];
  checkAndExpire(key: string): boolean;
}

export interface TTLReaperOptions {
  /** Interval in milliseconds between background sweep cycles. Default: 1000ms */
  intervalMs?: number;
  /** Number of random keys to sample in each sweep iteration. Default: 20 */
  sampleSize?: number;
  /** Maximum consecutive passes when more than 25% of sampled keys are expired. Default: 10 */
  maxConsecutivePasses?: number;
  /** Callback invoked when keys are actively expired by the reaper */
  onExpired?: (key: string) => void;
}

/**
 * Active background TTL sweeper modeled after Redis's active expiration algorithm.
 * Periodically samples keys and proactively removes expired entries to prevent memory leaks
 * when keys are written with TTL but never read again.
 */
export class TTLReaper {
  private readonly target: TTLReaperTarget;
  private readonly intervalMs: number;
  private readonly sampleSize: number;
  private readonly maxConsecutivePasses: number;
  private readonly onExpired?: (key: string) => void;
  private timer: NodeJS.Timeout | null = null;
  private _isRunning = false;
  private _totalReaped = 0;

  constructor(target: TTLReaperTarget, options: TTLReaperOptions = {}) {
    this.target = target;
    this.intervalMs = options.intervalMs ?? 1000;
    this.sampleSize = options.sampleSize ?? 20;
    this.maxConsecutivePasses = options.maxConsecutivePasses ?? 10;
    this.onExpired = options.onExpired;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get totalReaped(): number {
    return this._totalReaped;
  }

  /**
   * Starts the background sweeper timer.
   */
  public start(): void {
    if (this._isRunning) {
      return;
    }

    this._isRunning = true;
    this.timer = setInterval(() => {
      this.sweep();
    }, this.intervalMs);

    // unref() ensures this background timer will not prevent the Node.js event loop from exiting
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the background sweeper timer.
   */
  public stop(): void {
    if (!this._isRunning) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._isRunning = false;
  }

  /**
   * Performs an immediate active expiration sweep pass.
   * Can be called manually in unit tests or when memory pressure is detected.
   */
  public sweep(): number {
    let passCount = 0;
    let expiredInCurrentPass = 0;
    let totalExpiredThisSweep = 0;

    do {
      expiredInCurrentPass = 0;
      const sampledKeys = this.target.sampleKeys(this.sampleSize);
      if (sampledKeys.length === 0) {
        break;
      }

      for (const key of sampledKeys) {
        if (this.target.checkAndExpire(key)) {
          expiredInCurrentPass++;
          this._totalReaped++;
          totalExpiredThisSweep++;
          this.onExpired?.(key);
        }
      }

      passCount++;
      // If > 25% of sampled keys expired and we haven't reached max passes, repeat pass
    } while (
      passCount < this.maxConsecutivePasses &&
      expiredInCurrentPass > this.sampleSize * 0.25
    );

    return totalExpiredThisSweep;
  }
}
