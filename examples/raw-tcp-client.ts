import net from "net";
import { TCPServer } from "../src/index.js";

async function main() {
  console.log("=== CacheMesh Raw TCP (Language-Agnostic) Example ===\n");

  // Start server
  const server = new TCPServer({ port: 6381, host: "127.0.0.1" });
  await server.listen();
  console.log("Server listening on 127.0.0.1:6381\n");

  // Connect using Node's standard low-level TCP socket
  const socket = net.createConnection({ port: 6381, host: "127.0.0.1" });
  socket.setEncoding("utf8");

  socket.on("connect", () => {
    console.log("Raw socket connected. Sending pipelined newline-delimited JSON commands:\n");

    const commands = [
      JSON.stringify({ command: "PING", message: "RAW_TCP_TEST" }),
      JSON.stringify({ command: "SET", key: "article:1", value: { title: "TCP Internals", views: 1500 } }),
      JSON.stringify({ command: "GET", key: "article:1" }),
      JSON.stringify({ command: "INFO" }),
    ].join("\n") + "\n";

    console.log("--> OUTGOING TCP PAYLOAD:\n" + commands);
    socket.write(commands);
  });

  socket.on("data", (chunk: string) => {
    console.log("<-- INCOMING TCP DATA FROM SERVER:\n" + chunk);
    socket.end();
  });

  socket.on("close", async () => {
    console.log("Socket connection closed.");
    await server.close();
    console.log("Server stopped.");
  });
}

main().catch(console.error);
