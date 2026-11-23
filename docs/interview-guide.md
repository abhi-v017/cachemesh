# CacheMesh Senior Engineering Interview Guide

This guide breaks down the core systems, data structures, and networking questions interviewers ask about caching systems and how to explain CacheMesh with technical authority.

---

## 1. Core Systems & Data Structures

### Q1: How did you implement LRU cache eviction in $O(1)$ time without a doubly linked list?
**Strong Answer**:
> "In traditional C++ or Java, an LRU cache combines a Hash Map for $O(1)$ lookups with a Doubly Linked List for $O(1)$ node splicing to track recency. 
> In CacheMesh, I leveraged the ECMAScript 2015+ specification guarantee for JavaScript `Map`, which mandates deterministic insertion-order iteration.
> 
> When a key is accessed or updated, I delete it and immediately re-set it: `map.delete(key)` followed by `map.set(key, entry)`. In V8's internal hash table, this moves the entry to the tail of the iteration order in $O(1)$ time, marking it Most Recently Used (MRU). 
> When capacity is reached, `map.keys().next().value` retrieves the head of the iterator in $O(1)$ time, which is guaranteed to be the Least Recently Used (LRU) entry. This avoids the memory overhead and pointer manipulation of custom linked list nodes while achieving true $O(1)$ eviction."

---

### Q2: Why did you choose an entry-count limit over a byte-memory limit for v1?
**Strong Answer**:
> "In a managed, garbage-collected runtime like Node.js / V8, measuring the exact byte size of dynamic objects is notoriously imprecise and expensive. Determining the true memory footprint of an arbitrary object requires recursive traversal or JSON serialization heuristics, which adds severe CPU overhead to every write.
> Furthermore, `process.memoryUsage().heapUsed` reflects GC allocation cycles and heap fragmentation rather than active cache payload size. 
> An entry-count limit is deterministic, instantaneous to evaluate ($O(1)$ via `map.size`), and prevents Out-Of-Memory crashes predictably without GC stalls."

---

## 2. Networking & TCP Protocols

### Q3: Why can't a TCP server just do `JSON.parse(chunk.toString())`?
**Strong Answer**:
> "Because TCP is a **byte stream protocol**, not a **message protocol**. The OS kernel and network card slice or combine byte packets according to MTU, TCP window size, and congestion control without any knowledge of application boundaries.
> 
> This creates two common failure modes:
> 1. **Glued / Pipelined Packets**: A client sending two commands in rapid succession might have both arrive in a single `data` event: `'{"command":"PING"}\n{"command":"GET"}\n'`. A naive `JSON.parse` will throw a syntax error.
> 2. **Fragmented Packets**: A large JSON payload might arrive across multiple chunks: `'{"command":"SET","key"'` in chunk 1, and `'":"foo","value":1}\n'` in chunk 2. Calling `JSON.parse` on chunk 1 causes an immediate crash.
> 
> To solve this, CacheMesh implements **Delimiter-based Framing** via `ProtocolParser`. Each socket maintains its own buffer. We scan for `\n`, extract complete lines for parsing, and retain any incomplete trailing fragment until the next TCP chunk arrives."

---

### Q4: How does your Node.js client correlate responses when commands are pipelined?
**Strong Answer**:
> "Because TCP guarantees in-order byte delivery and our single-threaded server executes commands sequentially for each connection, the responses are guaranteed to be emitted in the exact order requests were received ($R_1 \rightarrow R_2 \rightarrow R_3$).
> 
> The client maintains a FIFO queue of awaiting promise resolvers (`pendingQueue: Array<{ resolve, reject }>`). When a command is sent, its Promise resolvers are pushed onto the queue. When a framed JSON response arrives from the server, we dequeue the front resolver (`pendingQueue.shift()`) and resolve it with the payload. This enables full TCP request pipelining without the overhead of tracking explicit Request IDs."

---

## 3. Concurrency & Performance

### Q5: How does CacheMesh handle race conditions and concurrency?
**Strong Answer**:
> "CacheMesh runs on the Node.js event loop using the **Reactor pattern** (powered by libuv), which operates on a single execution thread for JavaScript.
> 
> Because JavaScript executes synchronously on the main thread between I/O events, every cache operation (`SET`, `GET`, `DEL`, LRU eviction) is naturally atomic within that tick. A `GET` will never observe an intermediate state of a `SET` being executed. We get complete thread safety without mutexes, spinlocks, or read-write locks."

---

### Q6: Your benchmarks showed Direct Map is ~4.6M ops/sec, while TCP is ~8.4k ops/sec (~240x slower). Why would anyone use a TCP caching server instead of an in-process Map?
**Strong Answer**:
> "This 240x gap illustrates the **Cost of the Network Boundary**:
> - Direct Map access operates in user-space at DRAM speed (~200 nanoseconds), dereferencing pointers directly.
> - TCP involves JSON serialization, context switching from user-space to kernel-space (`send`/`recv` syscalls), loopback IP stack traversal, framing, and event loop scheduling (~119 microseconds).
> 
> Despite the latency difference, standalone caching servers (like Redis or CacheMesh) are essential in production for three critical architectural reasons:
> 1. **Shared State Across Horizontally Scaled Processes**: In modern microservices or clusters with 10 instances behind a load balancer, an in-process cache results in 10 disconnected caches, causing stale reads and duplicate database queries. A centralized cache provides a single source of truth.
> 2. **Decoupled Process Lifecycles**: Application servers restart frequently during deployments or crashes. An in-process cache vanishes on restart; a standalone cache server keeps the cache warm.
> 3. **Garbage Collection (GC) Isolation**: Storing millions of objects in an application's heap increases V8 mark-and-sweep GC pause times. Offloading cache storage to a dedicated caching server isolates memory pressure."

---

## 4. Expiration & Memory Management

### Q7: Why did you use both Lazy Expiration and Periodic Sweeping for TTL?
**Strong Answer**:
> "Lazy expiration checks `Date.now() >= expiresAt` on access ($O(1)$ amortized). While optimal for keys that are read frequently, it has a severe flaw: if a client writes 500,000 keys with a 60-second TTL and never queries them again, lazy expiration will never touch them. These are **zombie keys**, and they leak memory permanently.
> 
> The periodic sweep solves this by running an active background interval to sample and evict expired keys. Furthermore, to avoid 'Stop-the-World' latency spikes, our sweep inspects keys in bounded batches (`maxSweepBatchSize: 100`), ensuring predictable tail latency ($p99$) for incoming requests."
