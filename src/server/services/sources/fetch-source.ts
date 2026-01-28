/**
 * Serverless-compatible source fetch function.
 * Processes a source fetch directly without requiring a BullMQ worker.
 * Used by Vercel cron jobs and manual refresh actions.
 */

import { prisma } from "@/lib/prisma";
import { getAdapterOrThrow } from "@/server/services/sources";
import { isOddsAdapter, isResultsAdapter } from "@/server/services/sources/base-adapter";
import type { Prisma, Source } from "@prisma/client";
import { subDays } from "date-fns";

export interface FetchSourceResult {
  success: boolean;
  sourceId: string;
  sourceName: string;
  itemsFetched: number;
  newItems: number;
  resultsCreated: number;
  oddsCreated: number;
  error?: string;
}

/**
 * Fetch a single source directly (serverless-compatible).
 * This function can be called from API routes or server actions.
 */
export async function fetchSourceDirect(
  sourceId: string,
  triggeredBy: "MANUAL" | "SCHEDULED" | "API" = "API"
): Promise<FetchSourceResult> {
  console.log(`[FetchSource] Starting fetch for source ${sourceId}`);

  // Get source configuration
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
  });

  if (!source) {
    return {
      success: false,
      sourceId,
      sourceName: "Unknown",
      itemsFetched: 0,
      newItems: 0,
      resultsCreated: 0,
      oddsCreated: 0,
      error: `Source not found: ${sourceId}`,
    };
  }

  // Skip if source is paused
  if (source.status === "PAUSED") {
    return {
      success: false,
      sourceId,
      sourceName: source.name,
      itemsFetched: 0,
      newItems: 0,
      resultsCreated: 0,
      oddsCreated: 0,
      error: "Source is paused",
    };
  }

  // Create fetch run record
  const fetchRun = await prisma.sourceFetchRun.create({
    data: {
      sourceId: source.id,
      status: "RUNNING",
      triggeredBy,
      startedAt: new Date(),
    },
  });

  try {
    // Get the adapter
    const adapter = await getAdapterOrThrow(source.type);

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
            orgId: source.orgId,
            sourceId: source.id,
            externalId: item.externalId,
          },
        },
      });

      if (existing) {
        continue;
      }

      // Create news item
      await prisma.newsItem.create({
        data: {
          orgId: source.orgId,
          sourceId: source.id,
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
    }

    // Fetch and store game results if adapter supports it
    if (isResultsAdapter(adapter)) {
      try {
        const gameResults = await adapter.fetchResults(source, { since, limit: 100 });
        console.log(`[FetchSource] Fetched ${gameResults.length} game results`);

        for (const gameResult of gameResults) {
          await prisma.gameResult.upsert({
            where: {
              orgId_homeTeam_awayTeam_gameDate: {
                orgId: source.orgId,
                homeTeam: gameResult.homeTeam,
                awayTeam: gameResult.awayTeam,
                gameDate: gameResult.gameDate,
              },
            },
            update: {
              homeScore: gameResult.homeScore,
              awayScore: gameResult.awayScore,
              status: gameResult.status,
              statsJson: (gameResult.statsJson ?? undefined) as Prisma.InputJsonValue | undefined,
              externalGameId: gameResult.externalGameId,
            },
            create: {
              orgId: source.orgId,
              sourceId: source.id,
              sport: source.sport,
              homeTeam: gameResult.homeTeam,
              awayTeam: gameResult.awayTeam,
              gameDate: gameResult.gameDate,
              homeScore: gameResult.homeScore,
              awayScore: gameResult.awayScore,
              status: gameResult.status,
              statsJson: (gameResult.statsJson ?? undefined) as Prisma.InputJsonValue | undefined,
              externalGameId: gameResult.externalGameId,
            },
          });
          resultsCreated++;
        }
      } catch (error) {
        console.error(`[FetchSource] Error fetching results:`, error);
      }
    }

    // Fetch and store odds if adapter supports it
    if (isOddsAdapter(adapter)) {
      try {
        const oddsData = await adapter.fetchOdds(source, { since, limit: 100 });
        console.log(`[FetchSource] Fetched ${oddsData.length} odds snapshots`);

        for (const odds of oddsData) {
          // Delete existing snapshot for this game to avoid duplicates
          if (odds.externalGameId) {
            await prisma.oddsSnapshot.deleteMany({
              where: { externalGameId: odds.externalGameId, orgId: source.orgId },
            });
          }

          // Create new odds snapshot
          await prisma.oddsSnapshot.create({
            data: {
              orgId: source.orgId,
              sourceId: source.id,
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
        console.error(`[FetchSource] Error fetching odds:`, error);
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
      where: { id: fetchRun.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        itemsFetched,
        newItems,
      },
    });

    console.log(`[FetchSource] Completed: ${newItems} news, ${resultsCreated} results, ${oddsCreated} odds`);

    return {
      success: true,
      sourceId,
      sourceName: source.name,
      itemsFetched,
      newItems,
      resultsCreated,
      oddsCreated,
    };
  } catch (error) {
    console.error(`[FetchSource] Failed:`, error);

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
    await prisma.sourceFetchRun.update({
      where: { id: fetchRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return {
      success: false,
      sourceId,
      sourceName: source.name,
      itemsFetched: 0,
      newItems: 0,
      resultsCreated: 0,
      oddsCreated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Fetch multiple sources directly (serverless-compatible).
 * Processes sources sequentially to avoid overwhelming external APIs.
 */
export async function fetchSourcesDirect(
  sources: Source[],
  triggeredBy: "MANUAL" | "SCHEDULED" | "API" = "API"
): Promise<FetchSourceResult[]> {
  const results: FetchSourceResult[] = [];

  for (const source of sources) {
    const result = await fetchSourceDirect(source.id, triggeredBy);
    results.push(result);
  }

  return results;
}
