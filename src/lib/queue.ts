import { Queue, Worker, Job } from "bullmq";
import redis from "./redis";

// Queue names (BullMQ doesn't allow colons in queue names)
export const QUEUE_NAMES = {
  QUERY_RUN: "clipscout-query-run",
  VIDEO_FETCH: "clipscout-video-fetch",
  TRANSCRIPT_FETCH: "clipscout-transcript-fetch",
  VIDEO_ANALYZE: "clipscout-video-analyze",
  SCHEDULER: "clipscout-scheduler",
  EXPORT: "clipscout-export",
} as const;

// Default queue options
const defaultQueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

// Create queues
export const queryRunQueue = new Queue(QUEUE_NAMES.QUERY_RUN, defaultQueueOptions);
export const videoFetchQueue = new Queue(QUEUE_NAMES.VIDEO_FETCH, defaultQueueOptions);
export const transcriptFetchQueue = new Queue(QUEUE_NAMES.TRANSCRIPT_FETCH, defaultQueueOptions);
export const videoAnalyzeQueue = new Queue(QUEUE_NAMES.VIDEO_ANALYZE, defaultQueueOptions);
export const schedulerQueue = new Queue(QUEUE_NAMES.SCHEDULER, defaultQueueOptions);
export const exportQueue = new Queue(QUEUE_NAMES.EXPORT, defaultQueueOptions);

// Job data types
export interface QueryRunJobData {
  queryRunId: string;
  queryDefinitionId: string;
  orgId: string;
  triggeredBy: "MANUAL" | "SCHEDULED" | "SYSTEM";
  triggeredByUserId?: string;
}

export interface VideoFetchJobData {
  queryRunId: string;
  orgId: string;
  searchQuery: string;
  maxResults: number;
  publishedAfter?: string;
  channelIds?: string[];
}

export interface TranscriptFetchJobData {
  queryRunId: string;
  orgId: string;
  videoId: string;
  youtubeVideoId: string;
}

export interface VideoAnalyzeJobData {
  queryRunId: string;
  orgId: string;
  videoId: string;
  transcriptId: string;
  keywords: string[];
  sport: string;
}

export interface ExportJobData {
  exportJobId: string;
  orgId: string;
  candidateIds: string[];
  format: "CSV" | "JSON";
}

// Helper to create a worker with default settings
export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  options: { concurrency?: number } = {}
) {
  return new Worker<T>(queueName, processor, {
    connection: redis,
    concurrency: options.concurrency || 5,
  });
}

// Helper to add a job with priority
export async function addPriorityJob<T>(
  queue: Queue<T>,
  name: string,
  data: T,
  priority: "high" | "normal" | "low" = "normal"
) {
  const priorityMap = { high: 1, normal: 5, low: 10 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (queue as any).add(name, data, { priority: priorityMap[priority] });
}

// Get job status helper
export async function getJobStatus(queueName: string, jobId: string) {
  const queue = new Queue(queueName, { connection: redis });
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}
