# CacheMesh

> **Universal Caching SDK & Multi-Level Cache Engine**
> *Cache smarter. Perform faster.*

CacheMesh is an open-source, developer-focused caching SDK and multi-level caching engine for Node.js and TypeScript applications. It provides a unified, production-ready interface across process-local in-memory storage (L1) and distributed shared storage such as Redis (L2), complete with request coalescing, stampede protection, active TTL reaping, and tag-based invalidation.

---

## Key Features

- **Multi-Level Architecture:** Transparent coordination between L1 (Process Memory) and L2 (Distributed Redis) with automatic read backfilling and write-through propagation.
- **Production Eviction Algorithms:** Strict $O(1)$ LRU (Least Recently Used) and $O(1)$ LFU (Least Frequently Used) in-memory storage drivers with sentinel-based doubly-linked lists.
- **Request Coalescing (Singleflight):** Eliminates duplicate concurrent origin/database lookups during cache misses, shielding backends from thundering herd spikes.
- **Active & Lazy Expiration:** Combines lazy expiration on read with background active sampling sweepers (modeled after Redis active expiration) to prevent memory leaks from unread keys.
- **Tag-Based Invalidation:** Group keys by semantic tags (e.g. `['products', 'electronics']`) and invalidate collections atomically without expensive key scanning.
- **Mutation Immunity:** Configurable clone strategies (`none`, `shallow`, `deep`) to prevent in-memory cache corruption from external object mutations.
- **Zero-Setup Developer Experience:** Install and use as a standalone in-memory caching engine without any external infrastructure or cloud account requirements.

---

## Monorepo Architecture

```text
cachemesh/
├── packages/
│   ├── shared/     # Domain types, typed error hierarchy, hashing, clone & time utilities
│   ├── adapters/   # Pluggable storage drivers (MemoryAdapter with O(1) LRU/LFU/TTL)
│   ├── core/       # CacheEngine multi-layer pipeline, Singleflight coalescer, event bus
│   └── sdk/        # Ergonomic developer entrypoint (createCache, CacheClient, decorators)
├── examples/
│   └── quickstart/ # Runnable demonstration of getOrSet, coalescing, tags, and telemetry
├── vitest.config.ts
├── package.json    # Standard npm workspaces configuration
└── tsconfig.base.json
```

---

## Quickstart

### Installation

```bash
npm install @cachemesh/sdk
```

### 1. Basic In-Memory Caching

```typescript
import { createCache } from '@cachemesh/sdk';

// Initializes zero-config in-memory cache with LRU eviction
const cache = createCache({
  namespace: 'myapp',
  defaultTTL: 300, // 5 minutes
});

await cache.set('user:42', { name: 'Alice', role: 'admin' });
const user = await cache.get('user:42');
console.log(user); // { name: 'Alice', role: 'admin' }
```

### 2. Request Coalescing (`getOrSet`)

Prevents cache stampedes. When 100 requests arrive concurrently for an uncached key, the factory function executes only once:

```typescript
const product = await cache.getOrSet(
  'product:featured',
  async () => {
    // Only executed once across all concurrent callers
    return db.products.findMany({ where: { featured: true } });
  },
  { ttl: 600, tags: ['products'] }
);
```

### 3. Tag-Based Invalidation

```typescript
// Invalidate all cached products across all categories
await cache.invalidateTag('products');
```

### 4. Function Memoization Helper (`wrap`)

```typescript
const getProductById = cache.wrap(
  (id: string) => `product:${id}`,
  async (id: string) => db.products.findById(id),
  { ttl: 120 }
);

// Automatic caching based on arguments
const p1 = await getProductById('prod_123');
const p2 = await getProductById('prod_123'); // Cached hit!
```

---

## Running the Quickstart Demo

```bash
npm install
npm run build
npm start
```

## Running the Test Suite

```bash
npm test
```

---

## License

MIT
