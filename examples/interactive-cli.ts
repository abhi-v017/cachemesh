import readline from "readline";
import { CacheMeshClient } from "../src/client/client.js";

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 6380;
  const host = process.env.HOST || "127.0.0.1";

  const client = new CacheMeshClient({ host, port });

  console.log("================================================================");
  console.log("             CacheMesh Interactive CLI Playground ⚡            ");
  console.log("================================================================");
  console.log(`Connecting to CacheMesh at ${host}:${port}...`);

  try {
    await client.connect();
    console.log("Connected successfully!\n");
  } catch (err: any) {
    console.error(`Failed to connect to ${host}:${port}: ${err.message}`);
    console.log("Make sure the server is running first with: npm start\n");
    process.exit(1);
  }

  console.log("Available Commands:");
  console.log("  SET <key> <value> [ttlInSeconds]   (e.g. SET user:1 {\"name\":\"Alice\"} 30)");
  console.log("  GET <key>                          (e.g. GET user:1)");
  console.log("  DEL <key>                          (e.g. DEL user:1)");
  console.log("  EXISTS <key>                       (e.g. EXISTS user:1)");
  console.log("  INFO                               (Inspect real-time statistics)");
  console.log("  PING [message]                     (e.g. PING hello)");
  console.log("  HELP                               (Show this menu)");
  console.log("  QUIT / EXIT                        (Close CLI)");
  console.log("----------------------------------------------------------------\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "cachemesh> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const command = parts[0]?.toUpperCase();

    if (command === "QUIT" || command === "EXIT") {
      console.log("Goodbye!");
      await client.close();
      rl.close();
      process.exit(0);
    }

    if (command === "HELP") {
      console.log("\nCommands: SET <k> <v> [ttl], GET <k>, DEL <k>, EXISTS <k>, INFO, PING [msg], QUIT\n");
      rl.prompt();
      return;
    }

    try {
      switch (command) {
        case "PING": {
          const msg = parts[1]?.replace(/^"|"$/g, "");
          const res = await client.ping(msg);
          console.log(`PONG -> ${res}`);
          break;
        }

        case "SET": {
          if (parts.length < 3) {
            console.log("Usage: SET <key> <value> [ttlInSeconds]");
            break;
          }
          const key = parts[1]!.replace(/^"|"$/g, "");
          let rawVal = parts[2]!.replace(/^"|"$/g, "");
          let parsedVal: any = rawVal;
          try {
            parsedVal = JSON.parse(rawVal);
          } catch {
            // keep as string
          }

          let ttl: number | undefined;
          if (parts[3]) {
            const parsedTtl = parseFloat(parts[3]);
            if (!isNaN(parsedTtl)) {
              ttl = parsedTtl;
            }
          }

          await client.set(key, parsedVal, { ttl });
          console.log(`OK (Stored '${key}'${ttl ? ` with ${ttl}s TTL` : ""})`);
          break;
        }

        case "GET": {
          if (parts.length < 2) {
            console.log("Usage: GET <key>");
            break;
          }
          const key = parts[1]!.replace(/^"|"$/g, "");
          const val = await client.get(key);
          if (val === null) {
            console.log("(nil / expired / not found)");
          } else {
            console.log(typeof val === "object" ? JSON.stringify(val, null, 2) : val);
          }
          break;
        }

        case "DEL": {
          if (parts.length < 2) {
            console.log("Usage: DEL <key>");
            break;
          }
          const key = parts[1]!.replace(/^"|"$/g, "");
          const deleted = await client.delete(key);
          console.log(deleted ? "OK (1 key deleted)" : "0 (key not found)");
          break;
        }

        case "EXISTS": {
          if (parts.length < 2) {
            console.log("Usage: EXISTS <key>");
            break;
          }
          const key = parts[1]!.replace(/^"|"$/g, "");
          const exists = await client.exists(key);
          console.log(exists ? "1 (true)" : "0 (false)");
          break;
        }

        case "INFO": {
          const stats = await client.info();
          console.log("\n--- Server Statistics ---");
          console.log(`  Total Requests:  ${stats.totalRequests}`);
          console.log(`  Writes:          ${stats.writes}`);
          console.log(`  Cache Hits:      ${stats.hits}`);
          console.log(`  Cache Misses:    ${stats.misses}`);
          console.log(`  Deletes:         ${stats.deletes}`);
          console.log(`  Evictions:       ${stats.evictions}`);
          console.log(`  Expired Keys:    ${stats.expiredKeys}`);
          console.log(`  Current Entries: ${stats.currentEntries}`);
          console.log(`  Hit Ratio:       ${(stats.hitRatio * 100).toFixed(2)}%\n`);
          break;
        }

        default:
          console.log(`Unknown command: '${command}'. Type HELP for list of commands.`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }

    rl.prompt();
  });
}

main().catch(console.error);
