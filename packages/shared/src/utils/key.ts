import { KeyValidationError } from '../errors/index.js';

/**
 * Validates that a cache key is non-empty and does not contain illegal characters or excessive length.
 */
export function validateKey(key: string, maxKeyLength = 512): void {
  if (typeof key !== 'string') {
    throw new KeyValidationError(String(key), 'Key must be a string');
  }

  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new KeyValidationError(key, 'Key cannot be empty or only whitespace');
  }

  if (key.length > maxKeyLength) {
    throw new KeyValidationError(key, `Key length exceeds maximum allowed length of ${maxKeyLength} characters`);
  }
}

/**
 * Prefixes a key with the given namespace if one is defined.
 */
export function formatKey(namespace: string | undefined, key: string, delimiter = ':'): string {
  validateKey(key);
  if (!namespace) {
    return key;
  }
  return `${namespace}${delimiter}${key}`;
}

/**
 * Strips the namespace prefix from a formatted key.
 */
export function stripNamespace(formattedKey: string, namespace?: string, delimiter = ':'): string {
  if (!namespace) {
    return formattedKey;
  }
  const prefix = `${namespace}${delimiter}`;
  if (formattedKey.startsWith(prefix)) {
    return formattedKey.slice(prefix.length);
  }
  return formattedKey;
}
