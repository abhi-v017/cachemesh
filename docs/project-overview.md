# CacheMesh — Executive Project Overview

## 1. What This Project Actually Is
**CacheMesh** is a standalone, lightweight, in-memory key-value caching server inspired by Redis. It is written from scratch in TypeScript using Node.js's native `net` module, without relying on Redis or any third-party caching libraries.

Applications connect to CacheMesh over standard TCP sockets and exchange newline-delimited JSON commands to store, read, expire, and delete cached values in sub-millisecond time.

---

## 2. Why It Exists & The Problems It Solves

### Problem 1: Database Bottlenecks & High Read Latency
* **Database I/O**: Querying relational databases (PostgreSQL, MySQL) or disks takes anywhere from **5 to 20 milliseconds** due to disk seeks, query planning, indexing, and connection pooling.
* **CacheMesh Solution**: Storing data directly in RAM drops retrieval latency to **~0.1 milliseconds over TCP** (and sub-microsecond in-process), shielding databases from read overload.

### Problem 2: The In-Process Cache Limitation
* **The Trap**: A simple in-process `new Map()` works within one Node process, but if you scale horizontally to 5 web instances behind a load balancer, each instance has its own isolated, out-of-sync cache. Furthermore, every application restart or deployment wipes the cache.
* **CacheMesh Solution**: Provides a centralized, network-accessible cache that multiple application instances share as a single source of truth.

### Problem 3: Memory Exhaustion & Stale Data
* **Memory Exhaustion**: Without bounds, caching infinite keys eventually crashes the server with Out-of-Memory (OOM).
* **Zombie Keys**: If an item is given an expiration time but never queried again, pure lazy expiration leaves it in RAM forever.
* **CacheMesh Solution**: Enforces a strict **$O(1)$ LRU (Least Recently Used) eviction policy** when capacity is reached, and runs a **dual-strategy TTL engine** (passive check on read + active periodic background sweep) to safely eliminate dead keys.

---

## 3. What Every Component Does (Architecture Breakdown)

| Component | File | Role & Plain English Explanation |
| :--- | :--- | :--- |
| **MemoryStore** | `src/engine/memory-store.ts` | The raw in-memory data store. Uses JavaScript's `Map` insertion-order mechanics to maintain access recency without complex doubly-linked lists. |
| **TTLManager** | `src/engine/ttl-manager.ts` | Manages time-to-live. Checks if keys are expired during reads (lazy expiration) and runs a lightweight background sweep every 1000ms to clean up unread "zombie" keys. |
| **LRUEviction** | `src/engine/lru-eviction.ts` | Enforces capacity limits. When maximum entries are reached, it automatically evicts the oldest (least recently touched) key in $O(1)$ time. |
| **CacheEngine** | `src/engine/cache-engine.ts` | The master coordinator. Binds `MemoryStore`, `TTLManager`, `LRUEviction`, and `MetricsCollector` together. Completely independent of networking. |
| **ProtocolParser** | `src/protocol/parser.ts` | Stream framer. Solves the TCP "stream fragmentation" problem by buffering byte chunks and extracting complete messages split by `\n`. |
| **CommandHandler**| `src/commands/command-handler.ts`| The router and validator. Checks incoming JSON commands (`SET`, `GET`, `DEL`, `EXISTS`, `INFO`, `PING`), validates parameters, and calls the engine. |
| **TCPServer** | `src/server/tcp-server.ts` | Manages raw TCP sockets via Node's `net.Server`. Handles concurrent clients, abrupt disconnects (`ECONNRESET`), and graceful shutdowns. |
| **MetricsCollector**| `src/stats/metrics.ts` | Observability engine. Calculates live request counts, hits, misses, writes, deletes, evictions, expired keys, and hit ratio ($H = \frac{\text{Hits}}{\text{Hits} + \text{Misses}}$). |
| **CacheMeshClient**| `src/client/client.ts` | Developer-friendly Node.js SDK. Implements Promise-based methods (`get`, `set`, etc.) and supports request pipelining over a single socket using a FIFO queue. |

---

## 4. Technology Stack

* **Language**: TypeScript (Strict Mode, ES2022)
* **Runtime**: Node.js (v18+)
* **Networking**: Native Node.js `net` module (TCP streaming sockets)
* **Data Structures**: ECMAScript `Map` (leveraging insertion-order for $O(1)$ LRU recency)
* **Testing**: Vitest (75 unit and integration tests)
* **Build Tooling**: tsup (producing ESM, CommonJS, and `.d.ts` declaration files)
* **Code Quality**: ESLint and Prettier
* **External Runtime Dependencies**: **0** (strictly Node.js standard library)

---

## 5. File Structure

```
cachemesh/
├── src/
│   ├── index.ts                 # Server daemon entry point & startServer()
│   ├── server/
│   │   └── tcp-server.ts        # Node net.Server socket lifecycle manager
│   ├── protocol/
│   │   ├── types.ts             # Wire protocol command & response interfaces
│   │   ├── parser.ts            # Delimiter stream framer (\n / \r\n)
│   │   └── response.ts          # Standardized response factory
│   ├── engine/
│   │   ├── types.ts             # CacheEntry, CacheValue, IMemoryStore
│   │   ├── memory-store.ts      # O(1) Map wrapper with LRU order tracking
│   │   ├── ttl-manager.ts       # Expiration logic (lazy check + periodic sweep)
│   │   ├── lru-eviction.ts      # Capacity enforcement & recency pruning
│   │   └── cache-engine.ts      # Core caching engine coordinator
│   ├── commands/
│   │   └── command-handler.ts   # Command validation & routing
│   ├── stats/
│   │   └── metrics.ts           # Telemetry collector & hit-ratio calculations
│   └── client/
│       ├── client.ts            # Promise-based TCP client SDK with FIFO queue
│       └── index.ts             # Dedicated client module export
├── tests/
│   ├── unit/                    # Isolated tests for store, LRU, TTL, commands, parser
│   └── integration/             # Real TCP socket tests, concurrent clients, end-to-end
├── benchmarks/
│   └── benchmark.ts             # Microsecond latency and throughput benchmark runner
├── examples/
│   ├── basic-usage.ts           # Node.js SDK example
│   ├── raw-tcp-client.ts        # Raw TCP socket pipelining example
│   └── interactive-cli.ts       # Interactive redis-cli style terminal REPL
├── docs/
│   ├── architecture.md          # In-depth request lifecycle documentation
│   ├── interview-guide.md       # Senior systems engineering Q&A guide
│   └── project-overview.md      # This executive overview
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── README.md
```

---

## 6. How Users Use It

### 1. Start the Server
```bash
npm start
# Output: [CacheMesh] Server listening on 127.0.0.1:6380
```

### 2. Connect via the Node.js Client SDK
```typescript
import { CacheMeshClient } from "cachemesh/client";

const client = new CacheMeshClient({ host: "127.0.0.1", port: 6380 });
await client.connect();

// Store with optional TTL (in seconds)
await client.set("user:101", { name: "Alice", role: "admin" }, { ttl: 60 });

// Retrieve
const user = await client.get("user:101");

// Check presence
const exists = await client.exists("user:101"); // true

// Delete
await client.delete("user:101"); // true

// Inspect real-time server telemetry
const stats = await client.info();
console.log(`Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);

await client.close();
```

### 3. Connect via the Interactive CLI ("redis-cli" style)
```bash
npm run cli
```
```text
cachemesh> SET session:1 {"auth":true} 10
OK (Stored 'session:1' with 10s TTL)

cachemesh> GET session:1
{ "auth": true }

cachemesh> INFO
--- Server Statistics ---
  Total Requests: 2
  Cache Hits:     1
  Hit Ratio:      100.00%
```

### 4. Language-Agnostic Raw TCP (curl / netcat / Python / Go)
Send raw JSON terminated with `\n`:
```bash
echo '{"command":"GET","key":"user:101"}' | nc 127.0.0.1 6380
# Output: {"success":true,"value":{"name":"Alice","role":"admin"}}
```

---

## 7. Performance & Verification Summary
* **Automated Tests**: `npm test` runs 75 unit and integration tests across 10 test suites.
* **Benchmark Results (`npm run bench`)**:
  * Direct Map: ~4,642,000 ops/sec (0.0002 ms avg latency)
  * CacheMesh Engine: ~1,876,000 ops/sec (0.0005 ms avg latency)
  * CacheMesh TCP Loopback: ~8,400 ops/sec (0.1193 ms avg latency)
