import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TCPServer } from "../../src/server/tcp-server.js";
import { MiniCacheClient } from "../../src/client/client.js";

describe("End-to-End Real-World Workload", () => {
  let server: TCPServer;
  let serverPort: number;

  beforeEach(async () => {
    // Server with max 50 entries and fast sweep
    server = new TCPServer({
      port: 0,
      host: "127.0.0.1",
      engineOptions: {
        maxEntries: 50,
        ttlOptions: { sweepIntervalMs: 50, autoStart: true },
      },
    });
    const bound = await server.listen(0, "127.0.0.1");
    serverPort = bound.port;
  });

  afterEach(async () => {
    await server.close();
  });

  it("should handle multi-client concurrent operations, evictions, and TTL gracefully", async () => {
    const CLIENT_COUNT = 5;
    const clients: MiniCacheClient[] = [];

    for (let i = 0; i < CLIENT_COUNT; i++) {
      const client = new MiniCacheClient({ port: serverPort, host: "127.0.0.1" });
      await client.connect();
      clients.push(client);
    }

    // Client 0 writes 30 keys
    for (let i = 0; i < 30; i++) {
      await clients[0]!.set(`c0:key:${i}`, { val: i });
    }

    // Client 1 writes 30 keys (total 60 keys > 50 capacity => must trigger 10 evictions)
    for (let i = 0; i < 30; i++) {
      await clients[1]!.set(`c1:key:${i}`, { val: i });
    }

    // Client 2 writes 10 temporary keys with 40ms TTL
    for (let i = 0; i < 10; i++) {
      await clients[2]!.set(`temp:key:${i}`, "transient", { ttl: 0.04 });
    }

    // Client 3 reads keys (some will hit, early ones evicted)
    let hits = 0;
    let misses = 0;
    for (let i = 0; i < 30; i++) {
      const res = await clients[3]!.get(`c0:key:${i}`);
      if (res !== null) {
        hits++;
      } else {
        misses++;
      }
    }

    // Wait 120ms for TTL sweep to process transient keys (sweep interval is 50ms)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Also verify lazy expiration on any remaining transient key
    const tempCheck = await clients[3]!.get("temp:key:0");
    expect(tempCheck).toBeNull();

    // Client 4 checks stats
    const stats = await clients[4]!.info();

    expect(stats.totalRequests).toBeGreaterThan(70);
    expect(stats.writes).toBe(70); // 30 + 30 + 10
    expect(stats.evictions).toBeGreaterThan(0);
    expect(stats.currentEntries).toBeLessThanOrEqual(50);
    expect(stats.expiredKeys).toBeGreaterThanOrEqual(1);

    // Clean up all clients
    for (const client of clients) {
      await client.close();
    }
  });
});
