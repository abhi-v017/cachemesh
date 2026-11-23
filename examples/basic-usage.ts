import { TCPServer, CacheMeshClient } from "../src/index.js";

async function main() {
  console.log("=== CacheMesh Basic Usage Example ===\n");

  // 1. Start an in-process TCP server on port 6382 (so it won't conflict with any server on 6380)
  const server = new TCPServer({ port: 6382, host: "127.0.0.1" });
  await server.listen();
  console.log("1. Server booted on 127.0.0.1:6382");

  // 2. Connect a CacheMesh client
  const client = new CacheMeshClient({ port: 6382, host: "127.0.0.1" });
  await client.connect();
  console.log("2. Client connected successfully");

  // 3. Ping the server
  const pong = await client.ping();
  console.log(`3. PING -> ${pong}`);

  // 4. Store a value with a 2-second TTL
  await client.set("session:token:123", { userId: 42, role: "admin" }, { ttl: 2 });
  console.log("4. SET session:token:123 (TTL: 2s)");

  // 5. Retrieve the value immediately
  const session = await client.get("session:token:123");
  console.log("5. GET session:token:123 ->", JSON.stringify(session));

  // 6. Check existence
  const exists = await client.exists("session:token:123");
  console.log("6. EXISTS session:token:123 ->", exists);

  // 7. Wait 2.1 seconds for TTL expiration
  console.log("7. Waiting 2.1s for key to expire...");
  await new Promise((r) => setTimeout(r, 2100));

  const expiredSession = await client.get("session:token:123");
  console.log("8. GET after expiration ->", expiredSession); // null

  // 9. Inspect cache statistics
  const stats = await client.info();
  console.log("\n9. Cache Statistics:");
  console.log(`   - Total Requests: ${stats.totalRequests}`);
  console.log(`   - Cache Hits:     ${stats.hits}`);
  console.log(`   - Cache Misses:   ${stats.misses}`);
  console.log(`   - Expired Keys:   ${stats.expiredKeys}`);
  console.log(`   - Hit Ratio:      ${(stats.hitRatio * 100).toFixed(1)}%`);

  // 10. Clean shutdown
  await client.close();
  await server.close();
  console.log("\n10. Client and server closed cleanly.");
}

main().catch(console.error);
