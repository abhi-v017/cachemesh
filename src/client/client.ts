import net from "net";
import { CacheValue, SetOptions } from "../engine/types.js";
import { CacheStats } from "../stats/metrics.js";
import { CommandResponse } from "../protocol/types.js";
import { ProtocolParser } from "../protocol/parser.js";

export interface ClientOptions {
  host?: string;
  port?: number;
  connectTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (res: CommandResponse) => void;
  reject: (err: Error) => void;
}

/**
 * Lightweight, Promise-based TCP client for CacheMesh.
 *
 * Implements pipelined command execution over a single TCP socket
 * with FIFO response correlation.
 */
export class CacheMeshClient {
  private readonly host: string;
  private readonly port: number;
  private readonly connectTimeoutMs: number;
  private socket: net.Socket | null = null;
  private parser: ProtocolParser = new ProtocolParser();
  private pendingQueue: PendingRequest[] = [];
  private connectingPromise: Promise<void> | null = null;
  private closedExplicitly = false;

  constructor(options: ClientOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 6380;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
  }

  /**
   * Connects to the MiniCache server if not already connected.
   */
  public connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return Promise.resolve();
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.closedExplicitly = false;

    this.connectingPromise = new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      socket.setEncoding("utf8");

      let connected = false;

      const timeoutTimer = setTimeout(() => {
        if (!connected) {
          socket.destroy();
          reject(
            new Error(
              `Connection to ${this.host}:${this.port} timed out after ${this.connectTimeoutMs}ms`
            )
          );
        }
      }, this.connectTimeoutMs);

      socket.connect(this.port, this.host, () => {
        connected = true;
        clearTimeout(timeoutTimer);
        this.socket = socket;
        this.connectingPromise = null;
        resolve();
      });

      socket.on("data", (chunk: string) => {
        const messages = this.parser.append(chunk);
        for (const message of messages) {
          const pending = this.pendingQueue.shift();
          if (!pending) {
            continue;
          }

          if (message.error) {
            pending.reject(new Error(message.error));
          } else {
            pending.resolve(message.data as CommandResponse);
          }
        }
      });

      socket.on("error", (err) => {
        if (!connected) {
          clearTimeout(timeoutTimer);
          this.connectingPromise = null;
          reject(err);
        }
        this.flushPending(err);
      });

      socket.on("close", () => {
        this.socket = null;
        this.connectingPromise = null;
        if (!this.closedExplicitly) {
          this.flushPending(new Error("Connection closed unexpectedly"));
        }
      });
    });

    return this.connectingPromise;
  }

  /**
   * Sends a low-level command object and awaits the structured response.
   */
  public async sendCommand<T = unknown>(
    commandObj: Record<string, unknown>
  ): Promise<CommandResponse<T>> {
    if (this.closedExplicitly) {
      throw new Error("Client has been closed");
    }

    await this.connect();

    if (!this.socket || this.socket.destroyed || !this.socket.writable) {
      throw new Error("Socket is not connected or writable");
    }

    return new Promise<CommandResponse<T>>((resolve, reject) => {
      this.pendingQueue.push({
        resolve: resolve as (res: CommandResponse) => void,
        reject,
      });

      const payload = JSON.stringify(commandObj) + "\n";
      this.socket!.write(payload, (err) => {
        if (err) {
          const idx = this.pendingQueue.findIndex((p) => p.reject === reject);
          if (idx !== -1) {
            this.pendingQueue.splice(idx, 1);
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Stores a value for a key with optional TTL (in seconds).
   */
  public async set(key: string, value: CacheValue, options?: SetOptions): Promise<boolean> {
    const payload: Record<string, unknown> = {
      command: "SET",
      key,
      value,
    };

    if (options && typeof options.ttl === "number") {
      payload.ttl = options.ttl;
    }

    const res = await this.sendCommand(payload);
    if (!res.success) {
      throw new Error(res.error || "SET command failed");
    }
    return true;
  }

  /**
   * Retrieves the value associated with a key.
   * Returns null if key does not exist or has expired.
   */
  public async get(key: string): Promise<CacheValue | null> {
    const res = await this.sendCommand<CacheValue | null>({
      command: "GET",
      key,
    });

    if (!res.success) {
      throw new Error(res.error || "GET command failed");
    }

    return res.value ?? null;
  }

  /**
   * Deletes a key from the cache.
   * Returns true if the key was deleted, false if it did not exist.
   */
  public async delete(key: string): Promise<boolean> {
    const res = await this.sendCommand({
      command: "DEL",
      key,
    });

    if (!res.success) {
      throw new Error(res.error || "DEL command failed");
    }

    return res.deleted ?? false;
  }

  /**
   * Checks whether a key exists in the cache.
   */
  public async exists(key: string): Promise<boolean> {
    const res = await this.sendCommand({
      command: "EXISTS",
      key,
    });

    if (!res.success) {
      throw new Error(res.error || "EXISTS command failed");
    }

    return res.exists ?? false;
  }

  /**
   * Retrieves operational statistics from the cache server.
   */
  public async info(): Promise<CacheStats> {
    const res = await this.sendCommand({
      command: "INFO",
    });

    if (!res.success || !res.stats) {
      throw new Error(res.error || "INFO command failed");
    }

    return res.stats;
  }

  /**
   * Pings the server. Returns "PONG" or the custom echo message.
   */
  public async ping(message?: string): Promise<string> {
    const payload: Record<string, unknown> = { command: "PING" };
    if (message) {
      payload.message = message;
    }

    const res = await this.sendCommand({
      ...payload,
    });

    if (!res.success) {
      throw new Error(res.error || "PING command failed");
    }

    return res.message ?? "PONG";
  }

  /**
   * Closes the TCP connection cleanly.
   */
  public async close(): Promise<void> {
    this.closedExplicitly = true;
    this.flushPending(new Error("Client was closed by user"));

    if (this.socket && !this.socket.destroyed) {
      await new Promise<void>((resolve) => {
        this.socket!.end(() => {
          this.socket?.destroy();
          resolve();
        });
      });
    }

    this.socket = null;
    this.parser.reset();
  }

  /**
   * Flushes and rejects any pending requests when the socket disconnects.
   */
  private flushPending(err: Error): void {
    const queue = this.pendingQueue;
    this.pendingQueue = [];
    for (const req of queue) {
      req.reject(err);
    }
  }

  /**
   * Returns whether the client has an active, connected socket.
   */
  public isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }
}

/**
 * Backward-compatibility alias for MiniCacheClient.
 */
export const MiniCacheClient = CacheMeshClient;
