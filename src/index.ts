import { TCPServer } from "./server/tcp-server.js";

export * from "./engine/types.js";
export * from "./engine/memory-store.js";
export * from "./engine/ttl-manager.js";
export * from "./engine/lru-eviction.js";
export * from "./engine/cache-engine.js";
export * from "./protocol/types.js";
export * from "./protocol/parser.js";
export * from "./protocol/response.js";
export * from "./commands/command-handler.js";
export * from "./stats/metrics.js";
export * from "./server/tcp-server.js";
export * from "./client/client.js";

/**
 * Boots the default CacheMesh server when run directly.
 */
export async function startServer(port = 6380, host = "127.0.0.1"): Promise<TCPServer> {
  const server = new TCPServer({ port, host });
  const bound = await server.listen(port, host);
  console.log(`[CacheMesh] Server listening on ${bound.host}:${bound.port}`);
  return server;
}

// Auto-start if directly run via Node
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 6380;
  const host = process.env.HOST || "127.0.0.1";
  startServer(port, host).catch((err) => {
    console.error("[CacheMesh] Startup error:", err);
    process.exit(1);
  });
}
