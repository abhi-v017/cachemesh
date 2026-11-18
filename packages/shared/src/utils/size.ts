/**
 * Rough estimation of memory consumed by a JavaScript value in bytes.
 * Handles primitive types, arrays, and objects with cycle detection.
 */
export function estimateSize(value: unknown, seen = new WeakSet<object>()): number {
  if (value === null || value === undefined) {
    return 8;
  }

  switch (typeof value) {
    case 'boolean':
      return 4;
    case 'number':
      return 8;
    case 'string':
      return 8 + value.length * 2;
    case 'symbol':
      return 16;
    case 'bigint':
      return 16;
    case 'object': {
      if (seen.has(value)) {
        return 0; // Avoid infinite loops on circular references
      }
      seen.add(value);

      if (Buffer.isBuffer(value)) {
        return value.byteLength;
      }

      if (value instanceof ArrayBuffer) {
        return value.byteLength;
      }

      if (Array.isArray(value)) {
        let arrayBytes = 24; // Base array overhead
        for (const item of value) {
          arrayBytes += estimateSize(item, seen);
        }
        return arrayBytes;
      }

      let objBytes = 32; // Base object overhead
      for (const key of Object.keys(value as Record<string, unknown>)) {
        objBytes += key.length * 2;
        objBytes += estimateSize((value as Record<string, unknown>)[key], seen);
      }
      return objBytes;
    }
    default:
      return 8;
  }
}
