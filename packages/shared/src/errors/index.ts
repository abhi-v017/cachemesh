export class CacheError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'CACHE_ERROR') {
    super(message);
    this.name = 'CacheError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AdapterError extends CacheError {
  public readonly adapterName: string;
  public readonly originalError?: Error;

  constructor(adapterName: string, message: string, originalError?: Error) {
    super(`[Adapter:${adapterName}] ${message}`, 'ADAPTER_ERROR');
    this.name = 'AdapterError';
    this.adapterName = adapterName;
    this.originalError = originalError;
  }
}

export class TimeoutError extends CacheError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class CapacityExceededError extends CacheError {
  public readonly capacity: number;

  constructor(capacity: number, message = 'Cache capacity exceeded') {
    super(`${message} (capacity limit: ${capacity})`, 'CAPACITY_EXCEEDED');
    this.name = 'CapacityExceededError';
    this.capacity = capacity;
  }
}

export class SerializationError extends CacheError {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(`Serialization failed: ${message}`, 'SERIALIZATION_ERROR');
    this.name = 'SerializationError';
    this.originalError = originalError;
  }
}

export class KeyValidationError extends CacheError {
  public readonly key: string;

  constructor(key: string, reason: string) {
    super(`Invalid cache key '${key}': ${reason}`, 'KEY_VALIDATION_ERROR');
    this.name = 'KeyValidationError';
    this.key = key;
  }
}
