/**
 * Worker Entry Point
 *
 * This file is the entry point for the worker process that runs on Railway
 * or other platforms that support long-running processes.
 *
 * It initializes all BullMQ workers and keeps the process alive.
 */

import { Worker } from "bullmq";
import redis from "@/lib/redis";
import { QUEUE_NAMES } from "@/lib/queue";
import { registerAdapter } from "@/server/services/sources/adapter-factory";
import { processSourceFetch, createSourceFetchWorker } from "./source-fetch.worker";
import { processImportanceScore, createImportanceScoreWorker } from "./importance-score.worker";
import { processClipPair, createClipPairWorker } from "./clip-pair.worker";

const workers: Worker[] = [];

async function createWorkers() {
  console.log("Creating workers...");

  // Register adapters that can't be bundled by Next.js webpack
  // (puppeteer-extra uses dynamic require which webpack can't handle)
  const { draftKingsScraperAdapter } = await import("@/server/services/sources/draftkings-scraper");
  registerAdapter("DRAFTKINGS_SCRAPE", draftKingsScraperAdapter);
  console.log("  - DRAFTKINGS_SCRAPE adapter registered");

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

  console.log(`${workers.length} workers created and listening`);
}

async function shutdown() {
  console.log("Shutting down workers...");

  for (const worker of workers) {
    await worker.close();
    console.log(`  - ${worker.name} closed`);
  }

  await redis.quit();
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
