import { Queue, Worker, Job } from "bullmq";
import { getRedis, isRedisConfigured } from "./redis";

// Queue names (BullMQ doesn't allow colons in queue names)
export const QUEUE_NAMES = {
  QUERY_RUN: "clipscout-query-run",
  VIDEO_FETCH: "clipscout-video-fetch",
  TRANSCRIPT_FETCH: "clipscout-transcript-fetch",
  VIDEO_ANALYZE: "clipscout-video-analyze",
  SCHEDULER: "clipscout-scheduler",
  EXPORT: "clipscout-export",
  // News ingestion queues
  SOURCE_FETCH: "clipscout-source-fetch",
  IMPORTANCE_SCORE: "clipscout-importance-score",
  CLIP_PAIR: "clipscout-clip-pair",
} as const;

// Cache for queue instances
const queueCache = new Map<string, Queue>();

/**
 * Get or create a queue instance (lazy initialization).
 * Only connects to Redis when actually called.
 */
function getQueue(name: string): Queue {
  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured. Set REDIS_URL environment variable.");
  }

  let queue = queueCache.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential" as const,
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });
    queueCache.set(name, queue);
  }
  return queue;
}

// Lazy queue getters
export const queryRunQueue = {
  get instance() { return getQueue(QUEUE_NAMES.QUERY_RUN); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.QUERY_RUN).add(...args),
};

export const videoFetchQueue = {
  get instance() { return getQueue(QUEUE_NAMES.VIDEO_FETCH); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.VIDEO_FETCH).add(...args),
};

export const transcriptFetchQueue = {
  get instance() { return getQueue(QUEUE_NAMES.TRANSCRIPT_FETCH); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.TRANSCRIPT_FETCH).add(...args),
};

export const videoAnalyzeQueue = {
  get instance() { return getQueue(QUEUE_NAMES.VIDEO_ANALYZE); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.VIDEO_ANALYZE).add(...args),
};

export const schedulerQueue = {
  get instance() { return getQueue(QUEUE_NAMES.SCHEDULER); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.SCHEDULER).add(...args),
  getRepeatableJobs: () => getQueue(QUEUE_NAMES.SCHEDULER).getRepeatableJobs(),
  removeRepeatableByKey: (key: string) => getQueue(QUEUE_NAMES.SCHEDULER).removeRepeatableByKey(key),
};

export const exportQueue = {
  get instance() { return getQueue(QUEUE_NAMES.EXPORT); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.EXPORT).add(...args),
};

export const sourceFetchQueue = {
  get instance() { return getQueue(QUEUE_NAMES.SOURCE_FETCH); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.SOURCE_FETCH).add(...args),
};

export const importanceScoreQueue = {
  get instance() { return getQueue(QUEUE_NAMES.IMPORTANCE_SCORE); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.IMPORTANCE_SCORE).add(...args),
};

export const clipPairQueue = {
  get instance() { return getQueue(QUEUE_NAMES.CLIP_PAIR); },
  add: (...args: Parameters<Queue['add']>) => getQueue(QUEUE_NAMES.CLIP_PAIR).add(...args),
};

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

// News ingestion job data types
export interface SourceFetchJobData {
  sourceId: string;
  fetchRunId: string;
  orgId: string;
  triggeredBy: "MANUAL" | "SCHEDULED";
}

export interface ImportanceScoreJobData {
  newsItemId: string;
  orgId: string;
}

export interface ClipPairJobData {
  newsItemId: string;
  orgId: string;
}

// Helper to create a worker with default settings
export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  options: { concurrency?: number } = {}
) {
  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured. Set REDIS_URL environment variable.");
  }

  return new Worker<T>(queueName, processor, {
    connection: getRedis(),
    concurrency: options.concurrency || 5,
  });
}

// Helper to add a job with priority
export async function addPriorityJob<T>(
  queue: { add: Queue['add'] },
  name: string,
  data: T,
  priority: "high" | "normal" | "low" = "normal"
) {
  const priorityMap = { high: 1, normal: 5, low: 10 };
  return queue.add(name, data, { priority: priorityMap[priority] });
}

// Get job status helper
export async function getJobStatus(queueName: string, jobId: string) {
  if (!isRedisConfigured()) {
    return null;
  }

  const queue = getQueue(queueName);
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
