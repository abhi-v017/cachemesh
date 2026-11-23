import { describe, it, expect, beforeEach } from "vitest";
import { CacheEngine } from "../../src/engine/cache-engine.js";
import { CommandHandler } from "../../src/commands/command-handler.js";

describe("CommandHandler", () => {
  let engine: CacheEngine;
  let handler: CommandHandler;

  beforeEach(() => {
    engine = new CacheEngine();
    handler = new CommandHandler(engine);
  });

  it("should handle valid SET and GET commands", () => {
    const setRes = handler.handle({
      command: "SET",
      key: "user:1",
      value: { name: "Alex" },
    });
    expect(setRes).toEqual({
      success: true,
      message: "Value stored",
    });

    const getRes = handler.handle({
      command: "GET",
      key: "user:1",
    });
    expect(getRes).toEqual({
      success: true,
      value: { name: "Alex" },
    });
  });

  it("should return value: null for a missing key in GET", () => {
    const getRes = handler.handle({
      command: "GET",
      key: "nonexistent",
    });
    expect(getRes).toEqual({
      success: true,
      value: null,
    });
  });

  it("should handle DEL command correctly", () => {
    handler.handle({ command: "SET", key: "k1", value: "v1" });

    const delRes1 = handler.handle({ command: "DEL", key: "k1" });
    expect(delRes1).toEqual({
      success: true,
      deleted: true,
      message: "Key deleted",
    });

    const delRes2 = handler.handle({ command: "DEL", key: "k1" });
    expect(delRes2).toEqual({
      success: true,
      deleted: false,
      message: "Key not found",
    });
  });

  it("should handle EXISTS command correctly", () => {
    const res1 = handler.handle({ command: "EXISTS", key: "k1" });
    expect(res1).toEqual({ success: true, exists: false });

    handler.handle({ command: "SET", key: "k1", value: "v1" });
    const res2 = handler.handle({ command: "EXISTS", key: "k1" });
    expect(res2).toEqual({ success: true, exists: true });
  });

  it("should handle PING command with default and custom message", () => {
    expect(handler.handle({ command: "PING" })).toEqual({
      success: true,
      message: "PONG",
    });

    expect(handler.handle({ command: "PING", message: "MY_ECHO" })).toEqual({
      success: true,
      message: "MY_ECHO",
    });
  });

  it("should handle INFO command and return stats", () => {
    handler.handle({ command: "SET", key: "a", value: 1 });
    handler.handle({ command: "GET", key: "a" });
    handler.handle({ command: "GET", key: "missing" });

    const infoRes = handler.handle({ command: "INFO" });
    expect(infoRes.success).toBe(true);
    expect(infoRes.stats).toBeDefined();
    expect(infoRes.stats?.totalRequests).toBe(4); // SET, GET, GET, INFO
    expect(infoRes.stats?.writes).toBe(1);
    expect(infoRes.stats?.hits).toBe(1);
    expect(infoRes.stats?.misses).toBe(1);
    expect(infoRes.stats?.currentEntries).toBe(1);
    expect(infoRes.stats?.hitRatio).toBe(0.5);
  });

  it("should reject non-object payloads", () => {
    expect(handler.handle(null)).toEqual({
      success: false,
      error: "Invalid command payload: expected a JSON object",
    });

    expect(handler.handle("SET k1 v1")).toEqual({
      success: false,
      error: "Invalid command payload: expected a JSON object",
    });

    expect(handler.handle([1, 2, 3])).toEqual({
      success: false,
      error: "Invalid command payload: expected a JSON object",
    });
  });

  it("should reject unknown commands", () => {
    const res = handler.handle({ command: "FOOBAR" });
    expect(res).toEqual({
      success: false,
      error: "Unknown command: 'FOOBAR'",
    });
  });

  it("should validate required arguments for SET", () => {
    // Missing key
    expect(handler.handle({ command: "SET", value: "val" })).toEqual({
      success: false,
      error: "SET command requires a non-empty string 'key'",
    });

    // Empty key
    expect(handler.handle({ command: "SET", key: "   ", value: "val" })).toEqual({
      success: false,
      error: "SET command requires a non-empty string 'key'",
    });

    // Missing value
    expect(handler.handle({ command: "SET", key: "k1" })).toEqual({
      success: false,
      error: "SET command requires a 'value' field",
    });

    // Invalid TTL (negative or non-number)
    expect(handler.handle({ command: "SET", key: "k1", value: "v1", ttl: -10 })).toEqual({
      success: false,
      error: "TTL must be a positive number in seconds",
    });
  });

  it("should validate required arguments for GET, DEL, EXISTS", () => {
    expect(handler.handle({ command: "GET" })).toEqual({
      success: false,
      error: "GET command requires a non-empty string 'key'",
    });

    expect(handler.handle({ command: "DEL", key: 123 })).toEqual({
      success: false,
      error: "DEL command requires a non-empty string 'key'",
    });

    expect(handler.handle({ command: "EXISTS", key: "" })).toEqual({
      success: false,
      error: "EXISTS command requires a non-empty string 'key'",
    });
  });
});
