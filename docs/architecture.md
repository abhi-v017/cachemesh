# MiniCache Architecture & Request Lifecycle

## 1. System Overview

MiniCache is structured as a decoupled, layered pipeline where networking, stream parsing, command dispatching, storage, and eviction operate as distinct modules.

```
+─────────────────────────────────────────────────────────────────────────+
|                        External Client Application                      |
+─────────────────────────────────────────────────────────────────────────+
                                      │  TCP Socket Stream (Port 6380)
                                      ▼
+─────────────────────────────────────────────────────────────────────────+
|                         TCPServer (net.Server)                          |
|  - Manages active client sockets (Set<net.Socket>)                      |
|  - Handles socket lifecycle: 'data', 'error', 'close'                   |
|  - Encapsulates error boundaries (swallows ECONNRESET gracefully)       |
+─────────────────────────────────────────────────────────────────────────+
                                      │  Raw Byte Chunks (string / utf8)
                                      ▼
+─────────────────────────────────────────────────────────────────────────+
|                       ProtocolParser (Framing)                          |
|  - Appends chunk to per-socket buffer string                            |
|  - Scans for delimiter: '\n' (strips optional '\r')                     |
|  - Emits complete JSON lines; retains unparsed fragments in buffer      |
|  - Catches malformed JSON syntax errors safely                          |
+─────────────────────────────────────────────────────────────────────────+
                                      │  Parsed Command Object
                                      ▼
+─────────────────────────────────────────────────────────────────────────+
|                            CommandHandler                               |
|  - Increments global totalRequests telemetry                            |
|  - Validates schema, command keywords, keys, and values                 |
|  - Dispatches to CacheEngine; catches bad parameters                    |
+─────────────────────────────────────────────────────────────────────────+
                                      │  Engine Method Invocations
                                      ▼
+─────────────────────────────────────────────────────────────────────────+
|                             CacheEngine                                 |
|  - Coordinates storage, expiration checks, and LRU capacity             |
|  - Records hits, misses, writes, and deletes on MetricsCollector        |
+───────────────┬─────────────────────────┬───────────────────────────────+
                │                         │
     ┌──────────┴────────────┐            │
     ▼                       ▼            ▼
+───────────────+   +────────────────+ +─────────────────+ +─────────────+
|  MemoryStore  |   |   TTLManager   | |   LRUEviction   | |   Metrics   |
| (JS Map Data) |   | (Lazy + Sweep) | | (Access Order)  | | (Telemetry) |
+───────────────+   +────────────────+ +─────────────────+ +─────────────+
```

---

## 2. Request Lifecycle (Step-by-Step)

Here is what happens when a client sends `{"command":"SET","key":"user:1","value":{"role":"admin"},"ttl":60}\n`:

1. **Kernel Transmission**: The client writes bytes to the TCP socket. The operating system delivers bytes across the loopback network interface.
2. **Socket Ingestion**: The `TCPServer` receives a `data` event containing raw bytes (or partial chunks).
3. **Delimiter Framing**: The socket's dedicated `ProtocolParser` appends the chunk to its internal buffer. It slices complete lines at `\n` boundaries, leaving any trailing un-delimited fragment for the next tick.
4. **JSON Deserialization**: The line is parsed via `JSON.parse()`. If syntax is invalid, a structured error payload is produced immediately.
5. **Command Validation**: `CommandHandler` inspects `command: "SET"`. It validates that `key` is a non-empty string, `value` is present, and `ttl` is a positive number.
6. **LRU Capacity Enforcement**: `CacheEngine` invokes `lruEviction.prepareForInsert("user:1")`:
   - If `"user:1"` already exists, no eviction occurs.
   - If `"user:1"` is new and `store.size() >= maxEntries`, the oldest key at the head of `MemoryStore.keys()` is deleted and `metrics.recordEviction()` is triggered.
7. **Entry Creation & Storage**:
   - `createdAt` and `accessedAt` are set to `Date.now()`.
   - `expiresAt` is calculated as `Date.now() + (ttl * 1000)`.
   - `MemoryStore.set("user:1", entry)` moves `"user:1"` to the end (MRU) of the Map.
   - `metrics.recordWrite()` is incremented.
8. **Response Serialization & Write**: `CommandHandler` returns `{ success: true, message: "Value stored" }`. The server formats this as `JSON.stringify(response) + "\n"` and writes it back to `socket.write()`.

---

## 3. Cache Eviction & Expiration Strategy

MiniCache employs two distinct policies to ensure memory bounds and data freshness:

### A. Dual-Strategy TTL Expiration
1. **Passive / Lazy Expiration**:
   - On every `GET` or `EXISTS` call, `ttlManager.checkAndExpire(key, entry)` is evaluated.
   - If `entry.expiresAt !== null && Date.now() >= entry.expiresAt`:
     - The entry is deleted immediately.
     - `metrics.recordExpired()` is incremented.
     - The operation is treated as a cache miss (`value: null`).
2. **Active Periodic Sweep**:
   - Lazy expiration cannot prune keys that are written once and never queried again (the "zombie key" leak).
   - An active interval (`sweepIntervalMs`, default 1000ms) runs in the background.
   - To prevent event loop latency spikes, each sweep is bounded to a batch of keys (`maxSweepBatchSize`, default 100 keys).
   - Sweep timers use `timer.unref()` to ensure they never block Node.js from shutting down cleanly.

### B. Least Recently Used (LRU) Eviction
- MiniCache exploits the ECMAScript `Map` specification guarantee that iteration order reflects key insertion/re-insertion order.
- **Reading a key**: `store.touch(key)` deletes the key and re-inserts it with updated `accessedAt`, pushing it to the very back (Most Recently Used).
- **Evicting at capacity**: When `store.size() >= maxEntries`, `store.getOldestKey()` fetches `store.keys().next().value` (the front of the Map iterator) in $O(1)$ time and removes it.

---

## 4. Concurrency Model

* MiniCache runs on the **Node.js Reactor Pattern** (libuv event loop).
* Because all JavaScript execution inside the server is single-threaded, cache state operations are **intrinsically thread-safe**. There is zero mutex locking, condition variable overhead, or race condition hazard between concurrent TCP connections.
