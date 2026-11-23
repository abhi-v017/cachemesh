import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TCPServer } from "../../src/server/tcp-server.js";
import { MiniCacheClient } from "../../src/client/client.js";

describe("MiniCacheClient Integration", () => {
  let server: TCPServer;
  let client: MiniCacheClient;
  let serverPort: number;

  beforeEach(async () => {
    server = new TCPServer({ port: 0, host: "127.0.0.1" });
    const bound = await server.listen(0, "127.0.0.1");
    serverPort = bound.port;
    client = new MiniCacheClient({ port: serverPort, host: "127.0.0.1" });
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("should ping the server", async () => {
    expect(await client.ping()).toBe("PONG");
    expect(await client.ping("HELLO_SERVER")).toBe("HELLO_SERVER");
  });

  it("should execute basic SET, GET, EXISTS, and DELETE operations", async () => {
    // 1. Initial get is null
    expect(await client.get("user:100")).toBeNull();
    expect(await client.exists("user:100")).toBe(false);

    // 2. Set object
    const setResult = await client.set("user:100", { name: "Bob", role: "admin" });
    expect(setResult).toBe(true);

    // 3. Exists
    expect(await client.exists("user:100")).toBe(true);

    // 4. Get object
    const user = await client.get("user:100");
    expect(user).toEqual({ name: "Bob", role: "admin" });

    // 5. Delete
    expect(await client.delete("user:100")).toBe(true);
    expect(await client.delete("user:100")).toBe(false);

    // 6. Verify gone
    expect(await client.get("user:100")).toBeNull();
    expect(await client.exists("user:100")).toBe(false);
  });

  it("should support diverse value types (numbers, booleans, arrays, null)", async () => {
    await client.set("n", 42);
    await client.set("b", true);
    await client.set("a", [1, 2, "three"]);
    await client.set("nil", null);

    expect(await client.get("n")).toBe(42);
    expect(await client.get("b")).toBe(true);
    expect(await client.get("a")).toEqual([1, 2, "three"]);
    expect(await client.get("nil")).toBeNull();
  });

  it("should support TTL expiration through client options", async () => {
    await client.set("token:abc", "valid", { ttl: 0.05 }); // 50ms TTL

    expect(await client.get("token:abc")).toBe("valid");

    // Wait 60ms
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(await client.get("token:abc")).toBeNull();
    expect(await client.exists("token:abc")).toBe(false);
  });

  it("should retrieve and parse server statistics via info()", async () => {
    await client.set("k1", "v1");
    await client.get("k1"); // hit
    await client.get("missing"); // miss

    const stats = await client.info();
    expect(stats).toBeDefined();
    expect(stats.writes).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.currentEntries).toBe(1);
    expect(stats.hitRatio).toBe(0.5);
  });

  it("should handle pipelined concurrent commands in correct order", async () => {
    const promises = [
      client.set("pipe:1", "first"),
      client.set("pipe:2", "second"),
      client.get("pipe:1"),
      client.get("pipe:2"),
      client.delete("pipe:1"),
      client.exists("pipe:1"),
    ];

    const results = await Promise.all(promises);

    expect(results[0]).toBe(true); // SET pipe:1
    expect(results[1]).toBe(true); // SET pipe:2
    expect(results[2]).toBe("first"); // GET pipe:1
    expect(results[3]).toBe("second"); // GET pipe:2
    expect(results[4]).toBe(true); // DEL pipe:1
    expect(results[5]).toBe(false); // EXISTS pipe:1
  });

  it("should reject commands after client has been explicitly closed", async () => {
    await client.ping();
    await client.close();

    await expect(client.get("k")).rejects.toThrow("Client has been closed");
  });

  it("should reject cleanly if server connection fails", async () => {
    // Port 1 is reserved and typically closed
    const deadClient = new MiniCacheClient({ port: 1, host: "127.0.0.1", connectTimeoutMs: 200 });

    await expect(deadClient.ping()).rejects.toThrow();
    await deadClient.close();
  });
});
