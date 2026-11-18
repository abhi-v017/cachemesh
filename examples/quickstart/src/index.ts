/**
 * CacheMesh Quickstart Walkthrough
 *
 * This runnable demo shows:
 * 1. Zero-config caching setup.
 * 2. getOrSet pattern with Request Coalescing (Singleflight).
 * 3. Tag-based invalidation.
 * 4. Cache statistics and telemetry.
 */
import { createCache } from '@cachemesh/sdk';

async function main() {
  console.log('====================================================');
  console.log('   CacheMesh — Universal Caching Engine Demo       ');
  console.log('====================================================\n');

  // Step 1: Initialize CacheMesh with zero external dependencies
  const cache = createCache({
    namespace: 'demo',
    defaultTTL: 300, // 5 minutes default
    memory: {
      maxSize: 100, // Maximum 100 items in memory
      policy: 'lru', // Least Recently Used eviction algorithm
      cloneStrategy: 'deep', // Protect cached objects from external mutation
    },
  });

  // Listen to engine telemetry events in real time
  cache.on('hit', (e) => console.log(`[Event: HIT] Key="${e.key}" (layer: ${e.layer}, latency: ${e.latencyMs}ms)`));
  cache.on('miss', (e) => console.log(`[Event: MISS] Key="${e.key}" (latency: ${e.latencyMs}ms)`));
  cache.on('set', (e) => console.log(`[Event: SET] Key="${e.key}" (layer: ${e.layer}, ttl: ${e.ttl}s)`));

  // --- Step 2: Simple Get & Set ---
  console.log('--- Step 2: Basic Set and Get ---');
  await cache.set('system:status', { online: true, version: '1.0.0' }, { ttl: 60 });
  const status = await cache.get('system:status');
  console.log('Retrieved status from cache:', status);
  console.log();

  // --- Step 3: Request Coalescing (Singleflight) Demonstration ---
  console.log('--- Step 3: Thundering Herd / Request Coalescing Demo ---');
  console.log('Simulating 10 simultaneous requests for the same missing key...');

  let databaseQueryCount = 0;
  const mockDatabaseQuery = async (productId: string) => {
    databaseQueryCount++;
    console.log(`  -> [ORIGIN DB QUERY] Fetching product from database for ID: ${productId}`);
    // Simulate database network latency
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      id: productId,
      name: 'Wireless Mechanical Keyboard',
      price: 129.99,
      inStock: true,
    };
  };

  // Launch 10 concurrent requests simultaneously using Promise.all
  const concurrentRequests = Array.from({ length: 10 }, (_, index) =>
    cache.getOrSet(
      'product:101',
      () => mockDatabaseQuery('101'),
      { tags: ['products', 'electronics'], ttl: 120 }
    ).then((res) => {
      console.log(`  <- Caller #${index + 1} received: "${res.name}" ($${res.price})`);
      return res;
    })
  );

  await Promise.all(concurrentRequests);
  console.log(`\nResult: 10 callers were served, but the database was queried only ${databaseQueryCount} time!`);
  console.log('CacheMesh Singleflight successfully coalesced the concurrent misses.\n');

  // --- Step 4: Tag-Based Invalidation ---
  console.log('--- Step 4: Tag-Based Invalidation ---');
  // Store a second product
  await cache.set(
    'product:102',
    { id: '102', name: 'Ergonomic Gaming Mouse', price: 69.99 },
    { tags: ['products', 'electronics'] }
  );

  console.log('Checking keys before tag invalidation:');
  console.log('  product:101 exists?', await cache.has('product:101'));
  console.log('  product:102 exists?', await cache.has('product:102'));

  console.log('\nInvalidating all entries tagged with "electronics"...');
  const invalidatedCount = await cache.invalidateTag('electronics');
  console.log(`Invalidated ${invalidatedCount} keys.`);

  console.log('Checking keys after tag invalidation:');
  console.log('  product:101 exists?', await cache.has('product:101'));
  console.log('  product:102 exists?', await cache.has('product:102'));
  console.log();

  // --- Step 5: Inspection & Telemetry ---
  console.log('--- Step 5: Cache Telemetry & Health Statistics ---');
  const stats = await cache.getStats();
  console.log('Current Engine Stats:');
  console.log(JSON.stringify(stats, null, 2));

  // Clean shutdown
  await cache.disconnect();
  console.log('\nCacheMesh demo completed cleanly!');
}

main().catch((err) => {
  console.error('Error running demo:', err);
  process.exit(1);
});
