import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";
import { QUEUE_NAMES, ImportanceScoreJobData, clipPairQueue } from "@/lib/queue";
import { extractEntities } from "@/server/services/entity-extraction.service";
import { calculateImportanceScore } from "@/server/services/importance-scorer";

/**
 * Process an importance score job.
 * Extracts entities, calculates importance score, and queues for clip pairing if score is high enough.
 */
export async function processImportanceScore(job: Job<ImportanceScoreJobData>) {
  const { newsItemId, orgId } = job.data;

  console.log(`[ImportanceScore] Starting job ${job.id} for news item ${newsItemId}`);

  try {
    // Get news item
    const newsItem = await prisma.newsItem.findUnique({
      where: { id: newsItemId },
      include: { source: true },
    });

    if (!newsItem) {
      throw new Error(`News item not found: ${newsItemId}`);
    }

    // Extract entities
    const entities = extractEntities(
      newsItem.headline,
      newsItem.content || "",
      newsItem.sport
    );

    // Calculate importance score
    const scoreResult = calculateImportanceScore(newsItem, newsItem.source.name);

    // Update news item
    await prisma.newsItem.update({
      where: { id: newsItemId },
      data: {
        teams: entities.teams,
        players: entities.players,
        topics: entities.topics,
        importanceScore: scoreResult.totalScore,
        scoreBreakdown: scoreResult.breakdown as object,
        isProcessed: true,
      },
    });

    // Queue for clip pairing if score is high enough
    if (scoreResult.totalScore >= 40) {
      await clipPairQueue.add("pair-clips", {
        newsItemId,
        orgId,
      });
    }

    console.log(`[ImportanceScore] Job ${job.id} completed: score=${scoreResult.totalScore}`);
    return { score: scoreResult.totalScore, entities };
  } catch (error) {
    console.error(`[ImportanceScore] Job ${job.id} failed:`, error);
    throw error;
  }
}

/**
 * Create and start the importance score worker.
 */
export function createImportanceScoreWorker() {
  const worker = new Worker<ImportanceScoreJobData>(
    QUEUE_NAMES.IMPORTANCE_SCORE,
    async (job) => processImportanceScore(job),
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[ImportanceScore] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[ImportanceScore] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
