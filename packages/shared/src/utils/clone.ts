import type { CloneStrategy } from '../types/eviction.js';

/**
 * Clones a cached value based on the selected CloneStrategy.
 *
 * - 'none': Returns the reference directly. Fastest, but susceptible to external mutations.
 * - 'shallow': Returns a shallow copy of objects/arrays.
 * - 'deep': Returns a complete deep copy using native structuredClone.
 */
export function cloneValue<T>(value: T, strategy: CloneStrategy = 'none'): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (strategy === 'none') {
    return value;
  }

  if (strategy === 'shallow') {
    if (Array.isArray(value)) {
      return [...value] as unknown as T;
    }
    return { ...value } as T;
  }

  if (strategy === 'deep') {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    // Fallback for environments lacking structuredClone
    return JSON.parse(JSON.stringify(value));
  }

  return value;
}
