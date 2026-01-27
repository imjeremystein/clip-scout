import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";
import {
  queryRunQueue,
  sourceFetchQueue,
  QUEUE_NAMES,
  QueryRunJobData,
  SourceFetchJobData,
} from "@/lib/queue";
import { addMinutes, addDays, addHours } from "date-fns";

// Scheduler runs every minute to check for due queries
const SCHEDULER_INTERVAL = 60000; // 1 minute

interface SchedulerJobData {
  type: "check-schedules" | "check-sources" | "system-daily-refresh";
}

// Calculate next run time based on schedule settings (for queries)
function calculateNextRun(
  scheduleType: string,
  scheduleCron: string | null,
  scheduleTimezone: string,
  currentTime: Date
): Date | null {
  if (scheduleType === "MANUAL") return null;

  // Simple implementation - in production use a cron parser library
  const nextRun = new Date(currentTime);
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);

  switch (scheduleType) {
    case "HOURLY":
      nextRun.setHours(nextRun.getHours() + 1);
      break;

    case "DAILY":
      nextRun.setDate(nextRun.getDate() + 1);
      break;

    case "WEEKDAYS":
      do {
        nextRun.setDate(nextRun.getDate() + 1);
      } while (nextRun.getDay() === 0 || nextRun.getDay() === 6);
      break;

    case "WEEKLY":
      nextRun.setDate(nextRun.getDate() + 7);
      break;

    case "CUSTOM":
      // For custom cron, would need a proper cron parser
      // Default to daily for now
      nextRun.setDate(nextRun.getDate() + 1);
      break;

    default:
      return null;
  }

  return nextRun;
}

// Calculate next fetch time for sources
function calculateNextSourceFetch(
  scheduleType: string,
  refreshInterval: number, // minutes
  scheduleCron: string | null,
  currentTime: Date
): Date | null {
  if (scheduleType === "MANUAL") return null;

  switch (scheduleType) {
    case "HOURLY":
      return addMinutes(currentTime, refreshInterval);

    case "DAILY":
      return addDays(currentTime, 1);

    case "WEEKDAYS": {
      let next = addDays(currentTime, 1);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next = addDays(next, 1);
      }
      return next;
    }

    case "WEEKLY":
      return addDays(currentTime, 7);

    case "CUSTOM":
      // Would use a cron parser here in production
      return addHours(currentTime, 1);

    default:
      return addHours(currentTime, 1);
  }
}

// Process scheduled queries
async function processScheduledQueries() {
  const now = new Date();
  console.log(`[Scheduler] Checking for due queries at ${now.toISOString()}`);

  // Find all queries that are due to run
  const dueQueries = await prisma.queryDefinition.findMany({
    where: {
      isScheduled: true,
      isActive: true,
      deletedAt: null,
      nextRunAt: { lte: now },
    },
    include: {
      org: {
        select: { id: true, name: true },
      },
    },
  });

  console.log(`[Scheduler] Found ${dueQueries.length} queries due to run`);

  for (const query of dueQueries) {
    try {
      console.log(`[Scheduler] Queueing run for query: ${query.name} (${query.id})`);

      // Check if there's already a running or queued job for this query
      const existingRun = await prisma.queryRun.findFirst({
        where: {
          queryDefinitionId: query.id,
          status: { in: ["QUEUED", "RUNNING"] },
        },
      });

      if (existingRun) {
        console.log(`[Scheduler] Skipping - query already has a pending run`);
        continue;
      }

      // Create the run record
      const queryRun = await prisma.queryRun.create({
        data: {
          orgId: query.orgId,
          queryDefinitionId: query.id,
          status: "QUEUED",
          triggeredBy: "SCHEDULED",
        },
      });

      // Queue the job
      const jobData: QueryRunJobData = {
        queryRunId: queryRun.id,
        queryDefinitionId: query.id,
        orgId: query.orgId,
        triggeredBy: "SCHEDULED",
      };

      await queryRunQueue.add("scheduled-run", jobData, {
        jobId: queryRun.id,
      });

      // Calculate and update next run time
      const nextRun = calculateNextRun(
        query.scheduleType,
        query.scheduleCron,
        query.scheduleTimezone,
        now
      );

      await prisma.queryDefinition.update({
        where: { id: query.id },
        data: {
          nextRunAt: nextRun,
          lastRunAt: now,
        },
      });

      // Create audit event
      await prisma.auditEvent.create({
        data: {
          orgId: query.orgId,
          eventType: "QUERY_RUN_STARTED",
          entityType: "QueryRun",
          entityId: queryRun.id,
          action: `Scheduled run started for "${query.name}"`,
        },
      });

      console.log(`[Scheduler] Successfully queued run ${queryRun.id}, next run at ${nextRun?.toISOString()}`);
    } catch (error) {
      console.error(`[Scheduler] Error processing query ${query.id}:`, error);
    }
  }
}

// Process scheduled sources
async function processScheduledSources() {
  const now = new Date();
  console.log(`[Scheduler] Checking for due sources at ${now.toISOString()}`);

  // Find all sources that are due to fetch
  const dueSources = await prisma.source.findMany({
    where: {
      isScheduled: true,
      status: { in: ["ACTIVE"] }, // Not PAUSED, ERROR, or RATE_LIMITED
      nextFetchAt: { lte: now },
    },
    include: {
      org: {
        select: { id: true, name: true },
      },
    },
  });

  console.log(`[Scheduler] Found ${dueSources.length} sources due to fetch`);

  for (const source of dueSources) {
    try {
      console.log(`[Scheduler] Queueing fetch for source: ${source.name} (${source.id})`);

      // Check if there's already a running fetch for this source
      const existingRun = await prisma.sourceFetchRun.findFirst({
        where: {
          sourceId: source.id,
          status: { in: ["QUEUED", "RUNNING"] },
        },
      });

      if (existingRun) {
        console.log(`[Scheduler] Skipping - source already has a pending fetch`);
        continue;
      }

      // Create the fetch run record
      const fetchRun = await prisma.sourceFetchRun.create({
        data: {
          sourceId: source.id,
          status: "QUEUED",
          triggeredBy: "SCHEDULED",
          startedAt: now,
        },
      });

      // Queue the job
      const jobData: SourceFetchJobData = {
        sourceId: source.id,
        fetchRunId: fetchRun.id,
        orgId: source.orgId,
        triggeredBy: "SCHEDULED",
      };

      await sourceFetchQueue.add("scheduled-fetch", jobData, {
        jobId: fetchRun.id,
      });

      // Calculate and update next fetch time
      const nextFetch = calculateNextSourceFetch(
        source.scheduleType,
        source.refreshInterval,
        source.scheduleCron,
        now
      );

      await prisma.source.update({
        where: { id: source.id },
        data: {
          nextFetchAt: nextFetch,
          lastScheduledAt: now,
        },
      });

      console.log(`[Scheduler] Successfully queued fetch ${fetchRun.id}, next fetch at ${nextFetch?.toISOString()}`);
    } catch (error) {
      console.error(`[Scheduler] Error processing source ${source.id}:`, error);
    }
  }
}

// Create the scheduler worker
export function createSchedulerWorker() {
  const worker = new Worker<SchedulerJobData>(
    QUEUE_NAMES.SCHEDULER,
    async (job: Job<SchedulerJobData>) => {
      console.log(`[Scheduler] Processing job: ${job.data.type}`);

      switch (job.data.type) {
        case "check-schedules":
          // Check both queries and sources
          await processScheduledQueries();
          await processScheduledSources();
          break;

        case "check-sources":
          // Only check sources
          await processScheduledSources();
          break;

        case "system-daily-refresh":
          // This could be used for a system-wide daily refresh
          await processScheduledQueries();
          await processScheduledSources();
          break;

        default:
          console.warn(`[Scheduler] Unknown job type: ${job.data.type}`);
      }
    },
    {
      connection: redis,
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Scheduler] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Scheduler] Job ${job?.id} failed:`, err);
  });

  return worker;
}

// Initialize the scheduler with repeating job
export async function initializeScheduler() {
  const { schedulerQueue } = await import("@/lib/queue");

  // Remove any existing repeatable jobs
  const repeatableJobs = await schedulerQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await schedulerQueue.removeRepeatableByKey(job.key);
  }

  // Add the scheduler heartbeat job that runs every minute
  await schedulerQueue.add(
    "check-schedules",
    { type: "check-schedules" as const },
    {
      repeat: { every: SCHEDULER_INTERVAL },
      jobId: "scheduler-heartbeat",
    }
  );

  console.log("[Scheduler] Initialized with 1-minute interval");

  // Create and return the worker
  return createSchedulerWorker();
}

// For direct invocation (useful for testing)
export async function runSchedulerOnce() {
  await processScheduledQueries();
  await processScheduledSources();
}

// Run only source fetching (useful for cron jobs)
export async function runSourceSchedulerOnce() {
  await processScheduledSources();
}
