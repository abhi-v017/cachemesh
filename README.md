# CacheMesh ⚡

A lightweight, standalone, in-memory key-value caching server inspired by Redis, engineered from scratch in TypeScript and Node.js.

CacheMesh demonstrates how caching engines work internally—featuring an $O(1)$ LRU eviction algorithm, dual-strategy TTL expiration, newline-delimited TCP stream framing, request pipelining, and real-time cache telemetry.

```
                  ┌─────────────────────────────────────────┐
                  │          TCP Client Application         │
                  └─────────────────────────────────────────┘
                                       │  TCP (Port 6380)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │         TCPServer (net.Server)          │
                  └─────────────────────────────────────────┘
                                       │  Byte Stream
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │      ProtocolParser (\n Framing)        │
                  └─────────────────────────────────────────┘
                                       │  JSON Messages
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │         CommandHandler (Router)         │
                  └─────────────────────────────────────────┘
                                       │  Command Invocation
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │          CacheEngine (Coordinator)      │
                  └───┬───────────────────┬───────────────┬─┘
                      │                   │               │
       ┌──────────────┴──────┐            │               │
       ▼                     ▼            ▼               ▼
┌──────────────┐     ┌──────────────┐ ┌─────────────┐ ┌─────────────┐
│ MemoryStore  │     │  TTLManager  │ │ LRUEviction │ │   Metrics   │
│ (JS Map O(1))│     │(Lazy + Sweep)│ │ (Recency)   │ │ (Telemetry) │
└──────────────┘     └──────────────┘ └─────────────┘ └─────────────┘
```

---

## Features

* **Key-Value In-Memory Storage**: Fast $O(1)$ read and write operations supporting strings, numbers, booleans, arrays, null, and JSON-compatible nested objects.
* **Dual-Strategy TTL Management**:
  * **Lazy Expiration**: Expired keys are caught and removed on-access ($O(1)$ cost).
  * **Active Periodic Sweeping**: Background interval purges inactive "zombie" keys in bounded batches without blocking the event loop.
  * **Clean Process Lifecycle**: Uses `timer.unref()` and graceful shutdown hooks to ensure zero memory or timer leaks.
* **$O(1)$ LRU Eviction**: Exploits ECMAScript `Map` insertion-order guarantees to evict least recently accessed entries in constant time when capacity is reached.
* **TCP Server & Stream Framing**: Custom newline-delimited JSON protocol handled over native Node.js `net` sockets. Robust against fragmented packets, glued chunks, and client resets (`ECONNRESET`).
* **Request Pipelining Client SDK**: Full Promise-based Node.js client featuring FIFO request-response correlation over a single socket connection.
* **Real-time Observability**: Built-in telemetry tracking requests, writes, hits, misses, evictions, expired keys, current entries, and dynamic hit ratio.
* **Zero External Runtime Dependencies**: Built strictly using Node.js built-ins (`net`, `events`, `perf_hooks`).

---

## Installation & Setup

### Prerequisites
* Node.js $\ge$ 18.0.0
* npm $\ge$ 9.0.0

### Setup
```bash
# Clone the repository
git clone https://github.com/your-username/cachemesh.git
cd cachemesh

# Install development dependencies
npm install

# Build CommonJS, ESM, and TypeScript declaration bundles
npm run build
```

---

## Quickstart & Usage

### 1. Starting the Server
Start the CacheMesh daemon via CLI:
```bash
npm start
# [CacheMesh] Server listening on 127.0.0.1:6380
```

To run the interactive CLI playground (connects to running server):
```bash
npm run cli
```

To run pre-packaged runnable examples:
```bash
# Run Node.js client SDK end-to-end example
npm run example:basic

# Run raw TCP pipelined socket communication example
npm run example:raw
```
Or start programmatically:
```ts
import { TCPServer } from "cachemesh";

const server = new TCPServer({ port: 6380, host: "127.0.0.1" });
await server.listen();
```

---

### 2. Using the Node.js Client SDK
CacheMesh ships with a typed, Promise-based client:

```ts
import { CacheMeshClient } from "cachemesh/client";

async function run() {
  const client = new CacheMeshClient({ host: "127.0.0.1", port: 6380 });
  await client.connect();

  // Store a string value with a 60-second TTL
  await client.set("user:101", { name: "Alex", role: "developer" }, { ttl: 60 });

  // Retrieve value
  const user = await client.get("user:101");
  console.log(user); // { name: "Alex", role: "developer" }

  // Check existence
  const exists = await client.exists("user:101"); // true

  // Delete key
  await client.delete("user:101"); // true

  // Inspect real-time server telemetry
  const stats = await client.info();
  console.log(`Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);

  await client.close();
}

run();
```

---

### 3. Language-Agnostic Raw TCP Usage
Because CacheMesh uses newline-delimited JSON, any programming language (Python, Go, Rust, Java) or command-line tool (`nc`, `telnet`) can communicate with the server directly:

```bash
# Connect using netcat
nc 127.0.0.1 6380
```

```json
{"command":"PING"}
{"success":true,"message":"PONG"}

{"command":"SET","key":"session:token","value":{"auth":true},"ttl":30}
{"success":true,"message":"Value stored"}

{"command":"GET","key":"session:token"}
{"success":true,"value":{"auth":true}}

{"command":"INFO"}
{"success":true,"stats":{"totalRequests":3,"hits":1,"misses":0,"writes":1,"deletes":0,"evictions":0,"expiredKeys":0,"currentEntries":1,"hitRatio":1}}
```

---

## Wire Protocol Specification

Every command sent over TCP is a single JSON object terminated by a newline (`\n` or `\r\n`).

### Supported Commands

| Command | Arguments | Example Payload | Example Response |
| :--- | :--- | :--- | :--- |
| **`SET`** | `key` (string), `value` (any), `ttl` (optional seconds) | `{"command":"SET","key":"k1","value":123,"ttl":60}` | `{"success":true,"message":"Value stored"}` |
| **`GET`** | `key` (string) | `{"command":"GET","key":"k1"}` | `{"success":true,"value":123}` |
| **`DEL`** | `key` (string) | `{"command":"DEL","key":"k1"}` | `{"success":true,"deleted":true,"message":"Key deleted"}` |
| **`EXISTS`** | `key` (string) | `{"command":"EXISTS","key":"k1"}` | `{"success":true,"exists":true}` |
| **`INFO`** | none | `{"command":"INFO"}` | `{"success":true,"stats":{...}}` |
| **`PING`** | `message` (optional string) | `{"command":"PING","message":"HELLO"}` | `{"success":true,"message":"HELLO"}` |

---

## Systems Architecture Deep Dive

### 1. $O(1)$ LRU Eviction via ECMAScript Insertion Order
The ECMAScript specification guarantees that `Map` keys are iterated in insertion order. CacheMesh exploits this to implement Least Recently Used (LRU) caching with $O(1)$ performance:
* **Access/Update (MRU)**: When a key is read or updated, it is deleted and re-inserted:
  ```ts
  this.store.delete(key);
  this.store.set(key, entry);
  ```
  In V8, this moves the entry to the tail of the internal iteration table in $O(1)$ time.
* **Eviction (LRU)**: When `store.size >= maxEntries`, the oldest key is retrieved from the head of the iterator in $O(1)$ time:
  ```ts
  const oldestKey = this.store.keys().next().value;
  this.store.delete(oldestKey);
  ```

### 2. Dual-Strategy Expiration (Preventing Zombie Keys)
* **Lazy Expiration**: On every `get()` or `exists()`, if `Date.now() >= expiresAt`, the entry is pruned and reported as a miss ($O(1)$ cost).
* **Active Periodic Sweep**: Keys that are never read again would leak memory under pure lazy expiration. A background timer inspects bounded batches (`maxSweepBatchSize: 100`) every `1000ms`, safely purging expired entries without blocking the single-threaded event loop.

### 3. Stream Framing & TCP Pipelining
TCP does not enforce message boundaries. Multiple commands can arrive concatenated in a single packet (**glued frames**), or a single command can be fragmented across packets (**partial frames**).
* `ProtocolParser` maintains a per-connection string buffer, searching for `\n` boundaries.
* Trailing fragments are preserved in the buffer until the next TCP packet arrives.
* Responses are returned sequentially, enabling **Request Pipelining** where clients issue concurrent requests without waiting for round-trips.

---

## Performance Benchmarks

Benchmarks were performed on a local machine (Windows x64, AMD Ryzen 5 5600H, 12 cores, Node.js v24.13.0) measuring SET + GET operations across three architectural layers:

```bash
npm run bench
```

| Layer | Iterations | Throughput (Ops/sec) | Avg Latency | Median ($p50$) | 95th %ile ($p95$) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1. Direct JavaScript `Map`** | 20,000 | **4,642,000 ops/s** | 0.0002 ms (200 ns) | 0.0001 ms | 0.0003 ms |
| **2. CacheMesh Engine** | 20,000 | **1,876,000 ops/s** | 0.0005 ms (500 ns) | 0.0003 ms | 0.0008 ms |
| **3. CacheMesh TCP (Loopback)** | 2,000 | **8,400 ops/s** | 0.1193 ms (119 µs) | 0.1051 ms | 0.1939 ms |

### Architectural Insights
1. **The Network Boundary (240x Latency Jump)**: Moving from in-process memory (~500ns) to TCP loopback (~119µs) incurs overhead from JSON serialization, kernel context switches (`send`/`recv` syscalls), TCP stack traversal, and event loop scheduling.
2. **Why a Network Cache?**: Despite the 240x latency difference, network caches are required in production to share state across horizontally scaled processes, decouple cache lifecycles from app deployments, and prevent V8 garbage-collection pauses.

---

## Testing

CacheMesh maintains comprehensive unit and integration test coverage using [Vitest](https://vitest.dev/):

```bash
# Run all 75 unit & integration tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Format code
npm run format
```

### Test Suites Covered
* `tests/unit/memory-store.test.ts`: $O(1)$ operations, typed entries, access-ordering.
* `tests/unit/lru-eviction.test.ts`: Capacity enforcement, overwrite bypass, LRU candidate eviction.
* `tests/unit/ttl-manager.test.ts`: Lazy expiration, batch sweeps, timer lifecycle.
* `tests/unit/cache-engine.test.ts`: Core CRUD, metrics correlation, TTL + LRU coordination.
* `tests/unit/command-handler.test.ts`: Schema validation, argument types, error handling.
* `tests/unit/parser.test.ts`: Glued packets, fragmented TCP chunks, CRLF, malformed JSON.
* `tests/unit/metrics.test.ts`: Counters, hit ratio computation, telemetry reset.
* `tests/integration/tcp-server.test.ts`: Live TCP sockets, concurrency, abrupt client resets.
* `tests/integration/client.test.ts`: Client SDK methods, pipelined requests, error propagation.
* `tests/integration/endtoend.test.ts`: Multi-client concurrent workflows under capacity pressure.

---

## Project Structure

```
cachemesh/
├── src/
│   ├── index.ts                 # Main entry point & CLI bootstrapper
│   ├── server/
│   │   └── tcp-server.ts        # Node net.Server & socket lifecycle manager
│   ├── protocol/
│   │   ├── types.ts             # Wire protocol command & response interfaces
│   │   ├── parser.ts            # Delimiter-based stream framer
│   │   └── response.ts          # Structured response factory helpers
│   ├── engine/
│   │   ├── types.ts             # Cache entry, value, and store contracts
│   │   ├── memory-store.ts      # Low-level Map wrapper with order tracking
│   │   ├── ttl-manager.ts       # Expiration logic (lazy check + periodic sweep)
│   │   ├── lru-eviction.ts      # Capacity enforcement & LRU pruning
│   │   └── cache-engine.ts      # Core caching engine coordinator
│   ├── commands/
│   │   └── command-handler.ts   # Command validation & routing
│   ├── stats/
│   │   └── metrics.ts           # Telemetry & hit-ratio calculations
│   └── client/
│       ├── client.ts            # Promise-based TCP client SDK
│       └── index.ts             # Dedicated client module export
├── tests/
│   ├── unit/                    # Fast, isolated unit test suites
│   └── integration/             # Real TCP socket integration test suites
├── benchmarks/
│   └── benchmark.ts             # Empirical performance benchmark runner
├── examples/
│   ├── basic-usage.ts           # High-level Client SDK example
│   ├── raw-tcp-client.ts        # Low-level raw socket communication example
│   └── interactive-cli.ts       # Interactive redis-cli style terminal REPL
├── docs/
│   ├── architecture.md          # Request lifecycle & systems internals
│   └── interview-guide.md       # Senior systems engineering interview prep
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── README.md
```

---

## Known Limitations & Roadmap

### Version 1 Design Decisions
* **Entry-Count vs. Byte Memory**: Version 1 bounds memory strictly by entry count. In a dynamic GC runtime like V8, precise byte-level object calculation is computationally expensive and imprecise.
* **Single Node In-Memory**: CacheMesh is designed for single-node caching and does not implement clustering, Raft consensus, or distributed replication.
* **Non-Persistent**: All data resides in RAM. No AOF (Append-Only File) or RDB snapshots are written to disk.

### Future Roadmap
- [ ] Redis RESP protocol compatibility layer to allow standard `redis-cli` connections.
- [ ] Configurable approximate byte-memory limits based on serialized buffer lengths.
- [ ] Client Connection Pooling for high-concurrency microservices.
- [ ] Optional asynchronous append-only snapshotting for disk persistence.

---

## License

MIT License. Free for educational and commercial use.
