import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";
import {
  QUEUE_NAMES,
  SourceFetchJobData,
  importanceScoreQueue,
} from "@/lib/queue";
import { getAdapterOrThrow } from "@/server/services/sources";
import type { RawNewsItem, RawOddsData, RawGameResult } from "@/server/services/sources/types";
import { subDays } from "date-fns";

/**
 * Process a source fetch job.
 * Fetches news items, odds, or game results from a configured source.
 */
export async function processSourceFetch(job: Job<SourceFetchJobData>) {
  const { sourceId, fetchRunId, orgId, triggeredBy } = job.data;

  console.log(`[SourceFetch] Starting job ${job.id} for source ${sourceId}`);

  try {
    // Get source configuration
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    // Skip if source is paused
    if (source.status === "PAUSED") {
      console.log(`[SourceFetch] Source ${sourceId} is paused, skipping`);
      await updateFetchRunStatus(fetchRunId, "SKIPPED", "Source is paused");
      return;
    }

    // Update fetch run status to running
    await prisma.sourceFetchRun.update({
      where: { id: fetchRunId },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    // Get the adapter
    const adapter = getAdapterOrThrow(source.type);

    // Fetch items
    const since = source.lastFetchAt || subDays(new Date(), 7);
    const result = await adapter.fetch(source, { since, limit: 100 });

    let itemsFetched = 0;
    let newItems = 0;

    // Process news items
    for (const item of result.items) {
      itemsFetched++;

      // Check for duplicates
      const existing = await prisma.newsItem.findUnique({
        where: {
          orgId_sourceId_externalId: {
            orgId,
            sourceId,
            externalId: item.externalId,
          },
        },
      });

      if (existing) {
        continue;
      }

      // Create news item
      const newsItem = await prisma.newsItem.create({
        data: {
          orgId,
          sourceId,
          externalId: item.externalId,
          type: item.type,
          sport: source.sport,
          headline: item.headline,
          content: item.content,
          url: item.url,
          imageUrl: item.imageUrl,
          publishedAt: item.publishedAt,
          author: item.author,
          teams: [] as string[],
          players: [] as string[],
          topics: [] as string[],
          scoreBreakdown: {},
        },
      });

      newItems++;

      // Queue for importance scoring
      await importanceScoreQueue.add("score-item", {
        newsItemId: newsItem.id,
        orgId,
      });
    }

    // Update source status
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        lastFetchAt: new Date(),
        lastSuccessAt: new Date(),
        fetchCount: { increment: 1 },
      },
    });

    // Update fetch run status
    await prisma.sourceFetchRun.update({
      where: { id: fetchRunId },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        itemsFetched,
        newItems,
      },
    });

    console.log(`[SourceFetch] Job ${job.id} completed: ${newItems} new items`);
    return { itemsFetched, newItems };
  } catch (error) {
    console.error(`[SourceFetch] Job ${job.id} failed:`, error);

    // Update source status
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        lastErrorAt: new Date(),
        lastErrorMessage: error instanceof Error ? error.message : "Unknown error",
        errorCount: { increment: 1 },
      },
    });

    // Update fetch run status
    await updateFetchRunStatus(
      fetchRunId,
      "FAILED",
      error instanceof Error ? error.message : "Unknown error"
    );

    throw error;
  }
}

async function updateFetchRunStatus(
  fetchRunId: string,
  status: string,
  errorMessage?: string
) {
  await prisma.sourceFetchRun.update({
    where: { id: fetchRunId },
    data: {
      status,
      finishedAt: new Date(),
      errorMessage,
    },
  });
}

/**
 * Create and start the source fetch worker.
 */
export function createSourceFetchWorker() {
  const worker = new Worker<SourceFetchJobData>(
    QUEUE_NAMES.SOURCE_FETCH,
    async (job) => processSourceFetch(job),
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[SourceFetch] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[SourceFetch] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
