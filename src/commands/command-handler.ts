import { CacheEngine } from "../engine/cache-engine.js";
import { CommandResponse } from "../protocol/types.js";
import { Responses } from "../protocol/response.js";

/**
 * Validates incoming parsed command objects and dispatches them
 * to the CacheEngine, returning structured responses.
 */
export class CommandHandler {
  private readonly engine: CacheEngine;

  constructor(engine: CacheEngine) {
    this.engine = engine;
  }

  /**
   * Dispatches and handles a single command object.
   */
  public handle(raw: unknown): CommandResponse {
    this.engine.getMetrics().incrementRequests();

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return Responses.error("Invalid command payload: expected a JSON object");
    }

    const payload = raw as Record<string, unknown>;
    const commandName = typeof payload.command === "string" ? payload.command.toUpperCase() : null;

    if (!commandName) {
      return Responses.error("Missing or invalid 'command' field");
    }

    switch (commandName) {
      case "SET":
        return this.handleSet(payload);
      case "GET":
        return this.handleGet(payload);
      case "DEL":
        return this.handleDel(payload);
      case "EXISTS":
        return this.handleExists(payload);
      case "INFO":
        return this.handleInfo();
      case "PING":
        return this.handlePing(payload);
      default:
        return Responses.error(`Unknown command: '${commandName}'`);
    }
  }

  private handleSet(payload: Record<string, unknown>): CommandResponse {
    const key = payload.key;
    if (typeof key !== "string" || key.trim() === "") {
      return Responses.error("SET command requires a non-empty string 'key'");
    }

    if (!("value" in payload) || payload.value === undefined) {
      return Responses.error("SET command requires a 'value' field");
    }

    let ttl: number | undefined;
    if ("ttl" in payload && payload.ttl !== undefined && payload.ttl !== null) {
      if (typeof payload.ttl !== "number" || isNaN(payload.ttl) || payload.ttl <= 0) {
        return Responses.error("TTL must be a positive number in seconds");
      }
      ttl = payload.ttl;
    }

    this.engine.set(key, payload.value as any, { ttl });
    return Responses.ok("Value stored");
  }

  private handleGet(payload: Record<string, unknown>): CommandResponse {
    const key = payload.key;
    if (typeof key !== "string" || key.trim() === "") {
      return Responses.error("GET command requires a non-empty string 'key'");
    }

    const val = this.engine.get(key);
    return Responses.value(val);
  }

  private handleDel(payload: Record<string, unknown>): CommandResponse {
    const key = payload.key;
    if (typeof key !== "string" || key.trim() === "") {
      return Responses.error("DEL command requires a non-empty string 'key'");
    }

    const removed = this.engine.del(key);
    return Responses.deleted(removed);
  }

  private handleExists(payload: Record<string, unknown>): CommandResponse {
    const key = payload.key;
    if (typeof key !== "string" || key.trim() === "") {
      return Responses.error("EXISTS command requires a non-empty string 'key'");
    }

    const exists = this.engine.exists(key);
    return Responses.exists(exists);
  }

  private handleInfo(): CommandResponse {
    const stats = this.engine.info();
    return Responses.stats(stats);
  }

  private handlePing(payload: Record<string, unknown>): CommandResponse {
    const msg = typeof payload.message === "string" ? payload.message : undefined;
    const response = this.engine.ping(msg);
    return Responses.pong(response);
  }
}
