import { describe, it, expect, beforeEach, afterEach } from "vitest";
import net from "net";
import { TCPServer } from "../../src/server/tcp-server.js";

describe("TCPServer Integration", () => {
  let server: TCPServer;
  let serverPort: number;
  let activeClients: net.Socket[] = [];

  const createClient = (): Promise<net.Socket> => {
    return new Promise((resolve, reject) => {
      const client = net.createConnection({ port: serverPort, host: "127.0.0.1" }, () => {
        activeClients.push(client);
        resolve(client);
      });
      client.setEncoding("utf8");
      client.once("error", reject);
    });
  };

  const sendAndReceive = (
    client: net.Socket,
    payload: string,
    expectedCount = 1
  ): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      let buffer = "";
      const responses: any[] = [];

      const onData = (chunk: string) => {
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) {
            responses.push(JSON.parse(line));
            if (responses.length === expectedCount) {
              client.removeListener("data", onData);
              client.removeListener("error", onError);
              resolve(responses);
              return;
            }
          }
        }
      };

      const onError = (err: Error) => {
        client.removeListener("data", onData);
        reject(err);
      };

      client.on("data", onData);
      client.once("error", onError);
      client.write(payload);
    });
  };

  beforeEach(async () => {
    activeClients = [];
    server = new TCPServer({ port: 0, host: "127.0.0.1" });
    const bound = await server.listen(0, "127.0.0.1");
    serverPort = bound.port;
  });

  afterEach(async () => {
    for (const client of activeClients) {
      if (!client.destroyed) {
        client.destroy();
      }
    }
    await server.close();
  });

  it("should accept client connection and respond to PING", async () => {
    const client = await createClient();
    const res = await sendAndReceive(client, '{"command":"PING"}\n');

    expect(res).toEqual([{ success: true, message: "PONG" }]);
  });

  it("should handle SET, GET, DEL, and EXISTS commands over TCP", async () => {
    const client = await createClient();

    // 1. SET
    const setRes = await sendAndReceive(
      client,
      '{"command":"SET","key":"item:1","value":{"title":"Book"}}\n'
    );
    expect(setRes).toEqual([{ success: true, message: "Value stored" }]);

    // 2. EXISTS
    const existsRes = await sendAndReceive(client, '{"command":"EXISTS","key":"item:1"}\n');
    expect(existsRes).toEqual([{ success: true, exists: true }]);

    // 3. GET
    const getRes = await sendAndReceive(client, '{"command":"GET","key":"item:1"}\n');
    expect(getRes).toEqual([{ success: true, value: { title: "Book" } }]);

    // 4. DEL
    const delRes = await sendAndReceive(client, '{"command":"DEL","key":"item:1"}\n');
    expect(delRes).toEqual([{ success: true, deleted: true, message: "Key deleted" }]);

    // 5. GET after DEL
    const getAfterDel = await sendAndReceive(client, '{"command":"GET","key":"item:1"}\n');
    expect(getAfterDel).toEqual([{ success: true, value: null }]);
  });

  it("should handle glued messages sent in a single TCP chunk", async () => {
    const client = await createClient();

    const chunk =
      '{"command":"PING"}\n' +
      '{"command":"SET","key":"bulk:1","value":99}\n' +
      '{"command":"GET","key":"bulk:1"}\n';

    const responses = await sendAndReceive(client, chunk, 3);

    expect(responses).toHaveLength(3);
    expect(responses[0]).toEqual({ success: true, message: "PONG" });
    expect(responses[1]).toEqual({ success: true, message: "Value stored" });
    expect(responses[2]).toEqual({ success: true, value: 99 });
  });

  it("should handle fragmented messages split across TCP writes", async () => {
    const client = await createClient();

    // Write partial part 1
    client.write('{"command":"SE');

    // Wait 10ms
    await new Promise((r) => setTimeout(r, 10));

    // Write partial part 2
    client.write('T","key":"frag1","val');

    // Wait 10ms
    await new Promise((r) => setTimeout(r, 10));

    // Complete the message with part 3 and await response
    const responses = await sendAndReceive(client, 'ue":"success"}\n');

    expect(responses).toEqual([{ success: true, message: "Value stored" }]);

    // Verify key exists
    const getRes = await sendAndReceive(client, '{"command":"GET","key":"frag1"}\n');
    expect(getRes).toEqual([{ success: true, value: "success" }]);
  });

  it("should return structured error response for malformed JSON", async () => {
    const client = await createClient();

    const res = await sendAndReceive(client, "THIS_IS_NOT_JSON\n");
    expect(res).toHaveLength(1);
    expect(res[0].success).toBe(false);
    expect(res[0].error).toContain("Malformed JSON");
  });

  it("should handle multiple concurrent clients simultaneously", async () => {
    const client1 = await createClient();
    const client2 = await createClient();
    const client3 = await createClient();

    expect(server.getConnectionCount()).toBe(3);

    const [res1, res2, res3] = await Promise.all([
      sendAndReceive(client1, '{"command":"SET","key":"c1","value":"from1"}\n'),
      sendAndReceive(client2, '{"command":"SET","key":"c2","value":"from2"}\n'),
      sendAndReceive(client3, '{"command":"SET","key":"c3","value":"from3"}\n'),
    ]);

    expect(res1[0].success).toBe(true);
    expect(res2[0].success).toBe(true);
    expect(res3[0].success).toBe(true);

    // Cross-verify: client 1 can read what client 3 wrote
    const crossRead = await sendAndReceive(client1, '{"command":"GET","key":"c3"}\n');
    expect(crossRead[0].value).toBe("from3");
  });

  it("should handle abrupt client disconnection without crashing", async () => {
    const client = await createClient();
    expect(server.getConnectionCount()).toBe(1);

    // Forcefully destroy socket (simulating abrupt disconnect)
    client.destroy();

    // Give event loop time to process 'close'
    await new Promise((r) => setTimeout(r, 30));

    expect(server.getConnectionCount()).toBe(0);

    // New client should still connect and function normally
    const newClient = await createClient();
    const res = await sendAndReceive(newClient, '{"command":"PING"}\n');
    expect(res[0].message).toBe("PONG");
  });

  it("should gracefully close server and destroy active client sockets", async () => {
    const client = await createClient();
    expect(server.isRunning()).toBe(true);

    await server.close();
    expect(server.isRunning()).toBe(false);
    expect(server.getConnectionCount()).toBe(0);
  });
});
