import { TimeoutError } from '@cachemesh/shared';

interface InFlightCall<T> {
  promise: Promise<T>;
  callers: number;
}

/**
 * Singleflight Request Coalescer.
 * Suppresses duplicate concurrent in-flight requests for the exact same key.
 * If 100 requests for key "item:42" arrive simultaneously during a cache miss,
 * the compute/fetch factory is executed exactly ONCE, and the resolved result
 * is shared across all 100 waiting callers.
 */
export class Singleflight {
  private readonly inFlight = new Map<string, InFlightCall<unknown>>();

  /**
   * Number of distinct keys currently executing in-flight.
   */
  public get activeCount(): number {
    return this.inFlight.size;
  }

  /**
   * Executes a factory function or joins an existing in-flight execution for the given key.
   */
  public async execute<T>(
    key: string,
    factory: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      existing.callers++;
      return existing.promise as Promise<T>;
    }

    let promise = this.wrapWithTimeout(factory(), timeoutMs);

    const call: InFlightCall<T> = {
      promise,
      callers: 1,
    };

    this.inFlight.set(key, call as InFlightCall<unknown>);

    try {
      const result = await promise;
      return result;
    } finally {
      // Always remove from in-flight map immediately upon completion or rejection.
      // This prevents caching errors in the singleflight map and allows future requests to retry.
      this.inFlight.delete(key);
    }
  }

  private wrapWithTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) {
      return promise;
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError('Singleflight factory execution', timeoutMs));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
