import net from "net";
import { CacheEngine, CacheEngineOptions } from "../engine/cache-engine.js";
import { CommandHandler } from "../commands/command-handler.js";
import { ProtocolParser } from "../protocol/parser.js";
import { Responses } from "../protocol/response.js";

export interface TCPServerOptions {
  engine?: CacheEngine;
  engineOptions?: CacheEngineOptions;
  port?: number;
  host?: string;
}

/**
 * High-performance TCP server for CacheMesh.
 *
 * Coordinates socket lifecycles, stream framing, and command dispatching.
 */
export class TCPServer {
  private readonly server: net.Server;
  private readonly engine: CacheEngine;
  private readonly handler: CommandHandler;
  private readonly activeSockets = new Set<net.Socket>();
  private defaultPort: number;
  private defaultHost: string;
  private running = false;

  constructor(options: TCPServerOptions = {}) {
    this.defaultPort = options.port ?? 6380;
    this.defaultHost = options.host ?? "127.0.0.1";

    this.engine = options.engine ?? new CacheEngine(options.engineOptions);
    this.handler = new CommandHandler(this.engine);

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on("error", (err) => {
      // Server-level network error handling
      console.error(`[CacheMesh] TCP Server error: ${err.message}`);
    });
  }

  /**
   * Starts listening for client TCP connections.
   */
  public listen(
    port = this.defaultPort,
    host = this.defaultHost
  ): Promise<{ port: number; host: string }> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);

      this.server.listen(port, host, () => {
        this.server.removeListener("error", reject);
        this.running = true;

        const addr = this.server.address();
        if (addr && typeof addr === "object") {
          this.defaultPort = addr.port;
          this.defaultHost = addr.address;
        }

        resolve({ port: this.defaultPort, host: this.defaultHost });
      });
    });
  }

  /**
   * Gracefully shuts down the TCP server and closes all active sockets.
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.running = false;

      // Stop engine background timers (TTL sweep, etc.)
      this.engine.close();

      // Close all connected client sockets
      for (const socket of this.activeSockets) {
        try {
          socket.destroy();
        } catch {
          // Ignore socket destruction errors during shutdown
        }
      }
      this.activeSockets.clear();

      this.server.close(() => {
        resolve();
      });
    });
  }

  /**
   * Internal connection handler for every incoming TCP socket.
   */
  private handleConnection(socket: net.Socket): void {
    this.activeSockets.add(socket);
    socket.setEncoding("utf8");

    const parser = new ProtocolParser();

    socket.on("data", (chunk: string) => {
      const messages = parser.append(chunk);

      for (const message of messages) {
        let responseStr: string;

        if (message.error) {
          responseStr = JSON.stringify(Responses.error(message.error));
        } else {
          const response = this.handler.handle(message.data);
          responseStr = JSON.stringify(response);
        }

        // Write response followed by newline delimiter
        if (!socket.destroyed && socket.writable) {
          socket.write(responseStr + "\n");
        }
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      // Client abruptly terminated connection (e.g. ECONNRESET)
      // We clean up quietly without terminating the server process
      if (err.code !== "ECONNRESET") {
        console.warn(`[CacheMesh] Client socket error: ${err.message}`);
      }
    });

    socket.on("close", () => {
      this.activeSockets.delete(socket);
    });
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getConnectionCount(): number {
    return this.activeSockets.size;
  }

  public getPort(): number {
    return this.defaultPort;
  }

  public getHost(): string {
    return this.defaultHost;
  }

  public getEngine(): CacheEngine {
    return this.engine;
  }

  public getHandler(): CommandHandler {
    return this.handler;
  }
}

/**
 * Semantic alias for TCPServer.
 */
export const CacheMeshServer = TCPServer;
