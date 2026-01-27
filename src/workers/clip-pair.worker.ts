import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";
import { QUEUE_NAMES, ClipPairJobData } from "@/lib/queue";
import { findClipsForNews } from "@/server/services/clip-pairer";

/**
 * Process a clip pair job.
 * Finds matching clips for a news item.
 */
export async function processClipPair(job: Job<ClipPairJobData>) {
  const { newsItemId, orgId } = job.data;

  console.log(`[ClipPair] Starting job ${job.id} for news item ${newsItemId}`);

  try {
    // Get news item
    const newsItem = await prisma.newsItem.findUnique({
      where: { id: newsItemId },
    });

    if (!newsItem) {
      throw new Error(`News item not found: ${newsItemId}`);
    }

    // Find matching clips
    const matches = await findClipsForNews(newsItem);

    // Create clip matches
    for (const match of matches) {
      await prisma.clipMatch.upsert({
        where: {
          newsItemId_candidateId: {
            newsItemId,
            candidateId: match.candidateId,
          },
        },
        create: {
          orgId,
          newsItemId,
          candidateId: match.candidateId,
          status: "PENDING",
          matchScore: match.score,
          matchReason: match.reason,
        },
        update: {
          matchScore: match.score,
          matchReason: match.reason,
        },
      });
    }

    // Update news item paired status
    if (matches.length > 0) {
      await prisma.newsItem.update({
        where: { id: newsItemId },
        data: { isPaired: true },
      });
    }

    console.log(`[ClipPair] Job ${job.id} completed: ${matches.length} matches`);
    return { matchCount: matches.length };
  } catch (error) {
    console.error(`[ClipPair] Job ${job.id} failed:`, error);
    throw error;
  }
}

/**
 * Create and start the clip pair worker.
 */
export function createClipPairWorker() {
  const worker = new Worker<ClipPairJobData>(
    QUEUE_NAMES.CLIP_PAIR,
    async (job) => processClipPair(job),
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[ClipPair] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[ClipPair] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
