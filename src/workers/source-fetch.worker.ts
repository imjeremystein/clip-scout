import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";
import {
  QUEUE_NAMES,
  SourceFetchJobData,
  importanceScoreQueue,
} from "@/lib/queue";
import { getAdapterOrThrow } from "@/server/services/sources";
import { isOddsAdapter, isResultsAdapter } from "@/server/services/sources/base-adapter";
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
    let resultsCreated = 0;
    let oddsCreated = 0;

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

    // Fetch and store game results if adapter supports it
    if (isResultsAdapter(adapter)) {
      try {
        const gameResults = await adapter.fetchResults(source, { since, limit: 100 });
        console.log(`[SourceFetch] Fetched ${gameResults.length} game results`);

        for (const result of gameResults) {
          // Upsert game result (update if exists, create if not)
          await prisma.gameResult.upsert({
            where: {
              orgId_homeTeam_awayTeam_gameDate: {
                orgId,
                homeTeam: result.homeTeam,
                awayTeam: result.awayTeam,
                gameDate: result.gameDate,
              },
            },
            update: {
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              status: result.status,
              statsJson: result.statsJson,
              externalGameId: result.externalGameId,
            },
            create: {
              orgId,
              sourceId,
              sport: source.sport,
              homeTeam: result.homeTeam,
              awayTeam: result.awayTeam,
              gameDate: result.gameDate,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              status: result.status,
              statsJson: result.statsJson,
              externalGameId: result.externalGameId,
            },
          });
          resultsCreated++;
        }
      } catch (error) {
        console.error(`[SourceFetch] Error fetching results:`, error);
      }
    }

    // Fetch and store odds if adapter supports it
    if (isOddsAdapter(adapter)) {
      try {
        const oddsData = await adapter.fetchOdds(source, { since, limit: 100 });
        console.log(`[SourceFetch] Fetched ${oddsData.length} odds snapshots`);

        for (const odds of oddsData) {
          // Create new odds snapshot (always create to track line movement)
          await prisma.oddsSnapshot.create({
            data: {
              orgId,
              sourceId,
              sport: source.sport,
              homeTeam: odds.homeTeam,
              awayTeam: odds.awayTeam,
              gameDate: odds.gameDate,
              externalGameId: odds.externalGameId,
              homeMoneyline: odds.homeMoneyline,
              awayMoneyline: odds.awayMoneyline,
              spread: odds.spread,
              spreadJuice: odds.spreadJuice,
              overUnder: odds.overUnder,
              overJuice: odds.overJuice,
              underJuice: odds.underJuice,
            },
          });
          oddsCreated++;
        }
      } catch (error) {
        console.error(`[SourceFetch] Error fetching odds:`, error);
      }
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

    console.log(`[SourceFetch] Job ${job.id} completed: ${newItems} news, ${resultsCreated} results, ${oddsCreated} odds`);
    return { itemsFetched, newItems, resultsCreated, oddsCreated };
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
