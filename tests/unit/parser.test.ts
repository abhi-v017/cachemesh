import { describe, it, expect, beforeEach } from "vitest";
import { ProtocolParser } from "../../src/protocol/parser.js";

describe("ProtocolParser", () => {
  let parser: ProtocolParser;

  beforeEach(() => {
    parser = new ProtocolParser();
  });

  it("should parse a single complete message", () => {
    const messages = parser.append('{"command":"PING"}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.data).toEqual({ command: "PING" });
    expect(messages[0]!.error).toBeUndefined();
    expect(parser.getBuffer()).toBe("");
  });

  it("should handle CRLF (\\r\\n) from Windows/telnet", () => {
    const messages = parser.append('{"command":"PING"}\r\n');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.data).toEqual({ command: "PING" });
    expect(parser.getBuffer()).toBe("");
  });

  it("should handle partial incoming messages across multiple chunks", () => {
    // Chunk 1: partial
    const chunk1Messages = parser.append('{"command":"SE');
    expect(chunk1Messages).toHaveLength(0);
    expect(parser.getBuffer()).toBe('{"command":"SE');

    // Chunk 2: another partial
    const chunk2Messages = parser.append('T","key":"user:1",');
    expect(chunk2Messages).toHaveLength(0);
    expect(parser.getBuffer()).toBe('{"command":"SET","key":"user:1",');

    // Chunk 3: completion with newline
    const chunk3Messages = parser.append('"value":{"name":"Alex"}}\n');
    expect(chunk3Messages).toHaveLength(1);
    expect(chunk3Messages[0]!.data).toEqual({
      command: "SET",
      key: "user:1",
      value: { name: "Alex" },
    });
    expect(parser.getBuffer()).toBe("");
  });

  it("should handle multiple messages glued in a single chunk", () => {
    const chunk =
      '{"command":"PING"}\n{"command":"SET","key":"k1","value":100}\n{"command":"GET","key":"k1"}\n';
    const messages = parser.append(chunk);

    expect(messages).toHaveLength(3);
    expect(messages[0]!.data).toEqual({ command: "PING" });
    expect(messages[1]!.data).toEqual({ command: "SET", key: "k1", value: 100 });
    expect(messages[2]!.data).toEqual({ command: "GET", key: "k1" });
    expect(parser.getBuffer()).toBe("");
  });

  it("should ignore empty lines and blank enters", () => {
    const chunk = '\n\n  \n{"command":"PING"}\n\n';
    const messages = parser.append(chunk);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.data).toEqual({ command: "PING" });
  });

  it("should return an error for malformed JSON without throwing", () => {
    const messages = parser.append("not-valid-json-string\n");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.error).toBeDefined();
    expect(messages[0]!.error).toContain("Malformed JSON");
    expect(messages[0]!.raw).toBe("not-valid-json-string");
  });

  it("should preserve buffer when chunk has no newline", () => {
    parser.append("some un-delimited text");
    expect(parser.getBuffer()).toBe("some un-delimited text");
    parser.reset();
    expect(parser.getBuffer()).toBe("");
  });
});
