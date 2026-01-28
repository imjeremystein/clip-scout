/**
 * Worker Entry Point
 *
 * This file is the entry point for the worker process that runs on Railway
 * or other platforms that support long-running processes.
 *
 * It initializes all BullMQ workers and keeps the process alive.
 */

// Polyfill Web APIs for Node.js (required by undici/cheerio)
import { Blob, File } from "buffer";
import { FormData } from "undici";
(globalThis as any).Blob = Blob;
(globalThis as any).File = File;
(globalThis as any).FormData = FormData;

import { Worker } from "bullmq";
import { getRedis } from "@/lib/redis";
import { QUEUE_NAMES } from "@/lib/queue";
import { processSourceFetch, createSourceFetchWorker } from "./source-fetch.worker";
import { processImportanceScore, createImportanceScoreWorker } from "./importance-score.worker";
import { processClipPair, createClipPairWorker } from "./clip-pair.worker";
import { createQueryRunWorker } from "./query-run.worker";

const workers: Worker[] = [];

async function createWorkers() {
  console.log("Creating workers...");

  // Source Fetch Worker
  const sourceFetchWorker = createSourceFetchWorker();
  workers.push(sourceFetchWorker);
  console.log(`  - ${QUEUE_NAMES.SOURCE_FETCH} worker created`);

  // Importance Score Worker
  const importanceScoreWorker = createImportanceScoreWorker();
  workers.push(importanceScoreWorker);
  console.log(`  - ${QUEUE_NAMES.IMPORTANCE_SCORE} worker created`);

  // Clip Pair Worker
  const clipPairWorker = createClipPairWorker();
  workers.push(clipPairWorker);
  console.log(`  - ${QUEUE_NAMES.CLIP_PAIR} worker created`);

  // Query Run Worker
  const queryRunWorker = createQueryRunWorker();
  workers.push(queryRunWorker);
  console.log(`  - ${QUEUE_NAMES.QUERY_RUN} worker created`);

  console.log(`${workers.length} workers created and listening`);
}

async function shutdown() {
  console.log("Shutting down workers...");

  for (const worker of workers) {
    await worker.close();
    console.log(`  - ${worker.name} closed`);
  }

  await getRedis().quit();
  console.log("Redis connection closed");

  process.exit(0);
}

async function main() {
  console.log("=".repeat(50));
  console.log("Clip Scout Worker Process");
  console.log("=".repeat(50));
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Redis URL: ${process.env.REDIS_URL ? "configured" : "not configured"}`);
  console.log("=".repeat(50));

  // Create all workers
  await createWorkers();

  // Handle graceful shutdown
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Workers are running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Fatal error starting workers:", err);
  process.exit(1);
});
