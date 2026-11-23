import os from "os";
import { performance } from "perf_hooks";
import { CacheEngine } from "../src/engine/cache-engine.js";
import { TCPServer } from "../src/server/tcp-server.js";
import { CacheMeshClient } from "../src/client/client.js";

interface LatencyStats {
  opsPerSec: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  totalTimeMs: number;
  iterations: number;
}

function calculateStats(latencies: number[]): LatencyStats {
  latencies.sort((a, b) => a - b);
  const n = latencies.length;
  const total = latencies.reduce((acc, v) => acc + v, 0);

  const getPercentile = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * n), n - 1);
    return latencies[idx] ?? 0;
  };

  return {
    iterations: n,
    totalTimeMs: Number(total.toFixed(2)),
    opsPerSec: Math.round((n / total) * 1000),
    avgMs: Number((total / n).toFixed(4)),
    medianMs: Number(getPercentile(50).toFixed(4)),
    p95Ms: Number(getPercentile(95).toFixed(4)),
    p99Ms: Number(getPercentile(99).toFixed(4)),
  };
}

async function benchmarkDirectMap(iterations: number): Promise<LatencyStats> {
  const map = new Map<string, unknown>();
  const latencies: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    const key = `key:${i % 1000}`;
    const start = performance.now();
    map.set(key, { id: i, name: "bench" });
    map.get(key);
    const end = performance.now();
    latencies[i] = end - start;
  }

  return calculateStats(latencies);
}

async function benchmarkCacheEngine(iterations: number): Promise<LatencyStats> {
  const engine = new CacheEngine({ maxEntries: 2000 });
  const latencies: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    const key = `key:${i % 1000}`;
    const start = performance.now();
    engine.set(key, { id: i, name: "bench" });
    engine.get(key);
    const end = performance.now();
    latencies[i] = end - start;
  }

  return calculateStats(latencies);
}

async function benchmarkTCPClient(iterations: number): Promise<LatencyStats> {
  const server = new TCPServer({ port: 0, host: "127.0.0.1", engineOptions: { maxEntries: 2000 } });
  const bound = await server.listen(0, "127.0.0.1");
  const client = new CacheMeshClient({ port: bound.port, host: "127.0.0.1" });
  await client.connect();

  const latencies: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    const key = `key:${i % 500}`;
    const start = performance.now();
    await client.set(key, { id: i, name: "bench" });
    await client.get(key);
    const end = performance.now();
    latencies[i] = end - start;
  }

  await client.close();
  await server.close();

  return calculateStats(latencies);
}

function printRow(name: string, stats: LatencyStats) {
  console.log(
    `| ${name.padEnd(26)} | ${stats.iterations.toString().padStart(10)} | ${stats.opsPerSec
      .toLocaleString()
      .padStart(13)} | ${stats.avgMs.toFixed(4).padStart(11)} ms | ${stats.medianMs
      .toFixed(4)
      .padStart(11)} ms | ${stats.p95Ms.toFixed(4).padStart(11)} ms |`
  );
}

async function run() {
  console.log("===============================================================================");
  console.log("                       CacheMesh Performance Benchmark                         ");
  console.log("===============================================================================");
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU: ${os.cpus()[0]?.model || "Standard"} (${os.cpus().length} cores)`);
  console.log(`Node.js: ${process.version}`);
  console.log("===============================================================================\n");

  const IN_MEMORY_OPS = 20000;
  const TCP_OPS = 2000;

  console.log(`Running in-memory benchmarks (${IN_MEMORY_OPS.toLocaleString()} SET+GET pairs)...`);
  const mapStats = await benchmarkDirectMap(IN_MEMORY_OPS);
  const engineStats = await benchmarkCacheEngine(IN_MEMORY_OPS);

  console.log(`Running TCP network benchmark (${TCP_OPS.toLocaleString()} round-trip SET+GET pairs)...`);
  const tcpStats = await benchmarkTCPClient(TCP_OPS);

  console.log("\nResults:");
  console.log(
    "| Layer                      | Iterations | Ops/sec       | Avg Latency | Median (p50)| p95 Latency |"
  );
  console.log(
    "|----------------------------|------------|---------------|-------------|-------------|-------------|"
  );
  printRow("1. Direct JavaScript Map", mapStats);
  printRow("2. CacheMesh Engine", engineStats);
  printRow("3. CacheMesh TCP (Loopback)", tcpStats);
  console.log(
    "|----------------------------|------------|---------------|-------------|-------------|-------------|\n"
  );
}

run().catch(console.error);
