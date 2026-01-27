#!/usr/bin/env npx tsx

/**
 * Worker process entry point
 * Run with: npx tsx scripts/start-workers.ts
 */

import { createQueryRunWorker } from "../src/workers/query-run.worker";
import { createSchedulerWorker, initializeScheduler } from "../src/workers/scheduler.worker";

async function main() {
  console.log("Starting Clip Scout workers...");

  // Create workers
  const queryRunWorker = createQueryRunWorker();
  console.log("Query run worker started");

  // Initialize scheduler (creates repeatable job and starts worker)
  await initializeScheduler();
  console.log("Scheduler worker started");

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down workers...");

    await queryRunWorker.close();
    console.log("Query run worker closed");

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("All workers running. Press Ctrl+C to stop.");
}

main().catch((error) => {
  console.error("Failed to start workers:", error);
  process.exit(1);
});
