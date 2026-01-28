"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";
import { fetchSourceDirect } from "@/server/services/sources/fetch-source";
import type { ClipMatchStatus, Sport, SourceType } from "@prisma/client";
import { subMinutes } from "date-fns";

/**
 * Dismiss a news item (mark as not relevant).
 */
export async function dismissNewsItem(newsItemId: string) {
  const { orgId, userId } = await getTenantContext();

  const newsItem = await prisma.newsItem.findFirst({
    where: { id: newsItemId, orgId },
  });

  if (!newsItem) {
    throw new Error("News item not found");
  }

  // Update all clip matches for this news item to dismissed
  await prisma.clipMatch.updateMany({
    where: { newsItemId },
    data: { status: "DISMISSED" as ClipMatchStatus },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "CANDIDATE_STATUS_CHANGED",
      entityType: "NewsItem",
      entityId: newsItemId,
      action: `Dismissed news item: "${newsItem.headline.slice(0, 50)}..."`,
    },
  });

  revalidatePath("/news");
  revalidatePath(`/news/${newsItemId}`);

  return { success: true };
}

/**
 * Manually pair a clip to a news item.
 */
export async function pairClipToNews(newsItemId: string, candidateId: string) {
  const { orgId, userId } = await getTenantContext();

  // Verify both items belong to the org
  const [newsItem, candidate] = await Promise.all([
    prisma.newsItem.findFirst({ where: { id: newsItemId, orgId } }),
    prisma.candidate.findFirst({ where: { id: candidateId, orgId, deletedAt: null } }),
  ]);

  if (!newsItem) {
    throw new Error("News item not found");
  }
  if (!candidate) {
    throw new Error("Candidate not found");
  }

  // Create or update clip match
  await prisma.clipMatch.upsert({
    where: {
      newsItemId_candidateId: {
        newsItemId,
        candidateId,
      },
    },
    create: {
      orgId,
      newsItemId,
      candidateId,
      status: "MATCHED",
      matchScore: 1.0, // Manual match gets full score
      matchReason: "Manually paired by user",
    },
    update: {
      status: "MATCHED",
      matchScore: 1.0,
      matchReason: "Manually paired by user",
    },
  });

  // Mark news item as paired
  await prisma.newsItem.update({
    where: { id: newsItemId },
    data: { isPaired: true },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "CANDIDATE_STATUS_CHANGED",
      entityType: "ClipMatch",
      entityId: newsItemId,
      action: `Manually paired clip to news: "${newsItem.headline.slice(0, 30)}..."`,
    },
  });

  revalidatePath("/news");
  revalidatePath(`/news/${newsItemId}`);

  return { success: true };
}

/**
 * Unpair a clip from a news item.
 */
export async function unpairClip(clipMatchId: string) {
  const { orgId, userId } = await getTenantContext();

  const clipMatch = await prisma.clipMatch.findFirst({
    where: { id: clipMatchId, orgId },
    include: {
      newsItem: { select: { headline: true } },
    },
  });

  if (!clipMatch) {
    throw new Error("Clip match not found");
  }

  // Delete the clip match
  await prisma.clipMatch.delete({
    where: { id: clipMatchId },
  });

  // Check if news item has any remaining matches
  const remainingMatches = await prisma.clipMatch.count({
    where: { newsItemId: clipMatch.newsItemId },
  });

  if (remainingMatches === 0) {
    await prisma.newsItem.update({
      where: { id: clipMatch.newsItemId },
      data: { isPaired: false },
    });
  }

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "CANDIDATE_STATUS_CHANGED",
      entityType: "ClipMatch",
      entityId: clipMatchId,
      action: `Unpaired clip from news: "${clipMatch.newsItem.headline.slice(0, 30)}..."`,
    },
  });

  revalidatePath("/news");
  revalidatePath(`/news/${clipMatch.newsItemId}`);

  return { success: true };
}

/**
 * Confirm a suggested clip match.
 */
export async function confirmClipMatch(clipMatchId: string) {
  const { orgId, userId } = await getTenantContext();

  const clipMatch = await prisma.clipMatch.findFirst({
    where: { id: clipMatchId, orgId },
  });

  if (!clipMatch) {
    throw new Error("Clip match not found");
  }

  await prisma.clipMatch.update({
    where: { id: clipMatchId },
    data: { status: "MATCHED" },
  });

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "CANDIDATE_STATUS_CHANGED",
      entityType: "ClipMatch",
      entityId: clipMatchId,
      action: "Confirmed clip match",
    },
  });

  revalidatePath("/news");
  revalidatePath(`/news/${clipMatch.newsItemId}`);

  return { success: true };
}

/**
 * Refresh all sources for a sport (trigger immediate fetches).
 */
export async function refreshAllSources(sport?: Sport) {
  const { orgId, userId } = await getTenantContext();

  // Get all active sources for the sport (or all if not specified)
  const sources = await prisma.source.findMany({
    where: {
      orgId,
      status: "ACTIVE",
      ...(sport ? { sport } : {}),
    },
  });

  if (sources.length === 0) {
    return { success: false, message: "No active sources found" };
  }

  // Fetch sources directly (serverless-compatible)
  let fetchedCount = 0;

  for (const source of sources) {
    // Check for existing running fetch
    const existingRun = await prisma.sourceFetchRun.findFirst({
      where: {
        sourceId: source.id,
        status: "RUNNING",
      },
    });

    if (existingRun) {
      continue; // Skip if already running
    }

    // Fetch directly (serverless-compatible, no worker required)
    await fetchSourceDirect(source.id, "MANUAL");
    fetchedCount++;
  }

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_RUN_STARTED",
      entityType: "Source",
      entityId: "all",
      action: `Refreshed ${fetchedCount} sources${sport ? ` for ${sport}` : ""}`,
    },
  });

  revalidatePath("/admin/sources");
  revalidatePath("/dashboard");

  return {
    success: true,
    message: `Fetched ${fetchedCount} of ${sources.length} sources`,
    queuedCount: fetchedCount,
    totalSources: sources.length,
  };
}

/**
 * Get news feed with filters.
 */
export async function getNewsFeed(options: {
  sport?: Sport;
  type?: string;
  minScore?: number;
  limit?: number;
  offset?: number;
}) {
  const { orgId } = await getTenantContext();

  const { sport, type, minScore = 0, limit = 50, offset = 0 } = options;

  const where = {
    orgId,
    ...(sport ? { sport } : {}),
    ...(type ? { type: type as any } : {}),
    importanceScore: { gte: minScore },
  };

  const [items, total] = await Promise.all([
    prisma.newsItem.findMany({
      where,
      include: {
        source: { select: { name: true, type: true } },
        clipMatches: {
          where: { status: { in: ["MATCHED", "PENDING"] } },
          take: 3,
          orderBy: { matchScore: "desc" },
        },
      },
      orderBy: [{ publishedAt: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.newsItem.count({ where }),
  ]);

  return {
    items,
    total,
    hasMore: offset + items.length < total,
  };
}

/**
 * Get a single news item with full details.
 */
export async function getNewsItem(newsItemId: string) {
  const { orgId } = await getTenantContext();

  const item = await prisma.newsItem.findFirst({
    where: { id: newsItemId, orgId },
    include: {
      source: true,
      clipMatches: {
        include: {
          candidate: {
            include: {
              video: true,
              moments: true,
            },
          },
        },
        orderBy: { matchScore: "desc" },
      },
    },
  });

  if (!item) {
    throw new Error("News item not found");
  }

  return item;
}

/**
 * Get top news items for dashboard.
 */
export async function getTopNews(limit: number = 10) {
  const { orgId } = await getTenantContext();

  return prisma.newsItem.findMany({
    where: {
      orgId,
      importanceScore: { gte: 50 },
    },
    include: {
      source: { select: { name: true } },
    },
    orderBy: [{ importanceScore: "desc" }, { publishedAt: "desc" }],
    take: limit,
  });
}

/**
 * Get unmatched news items count.
 */
export async function getUnmatchedNewsCount() {
  const { orgId } = await getTenantContext();

  return prisma.newsItem.count({
    where: {
      orgId,
      isProcessed: true,
      isPaired: false,
      importanceScore: { gte: 40 },
    },
  });
}

// Source types by content category
const NEWS_SOURCE_TYPES: SourceType[] = [
  "TWITTER_SEARCH",
  "TWITTER_LIST",
  "RSS_FEED",
  "WEBSITE_SCRAPE",
];
const ODDS_SOURCE_TYPES: SourceType[] = ["SPORTSGRID_API"];
const RESULTS_SOURCE_TYPES: SourceType[] = ["ESPN_API"];

/**
 * Refresh sources by content type.
 * Triggers active sources filtered by category, respecting 1-minute cooldown.
 */
export async function refreshResultsByType(
  type: "all" | "news" | "odds" | "results"
) {
  const { orgId, userId } = await getTenantContext();

  let sourceTypes: SourceType[] | undefined;
  if (type === "news") sourceTypes = NEWS_SOURCE_TYPES;
  else if (type === "odds") sourceTypes = ODDS_SOURCE_TYPES;
  else if (type === "results") sourceTypes = RESULTS_SOURCE_TYPES;
  // "all" leaves sourceTypes undefined to fetch all active sources

  const sources = await prisma.source.findMany({
    where: {
      orgId,
      status: "ACTIVE",
      ...(sourceTypes ? { type: { in: sourceTypes } } : {}),
    },
  });

  if (sources.length === 0) {
    const categoryMessages: Record<string, string> = {
      news: "No active news sources (RSS, Twitter, web scraper) configured",
      odds: "No active odds sources (SportsGrid) configured",
      results: "No active results sources (ESPN API) configured",
      all: "No active sources configured",
    };
    return {
      success: false,
      message: categoryMessages[type] || "No active sources found for this category",
      queuedCount: 0,
      skippedCount: 0,
      totalSources: 0,
    };
  }

  const now = new Date();
  const cooldownThreshold = subMinutes(now, 1);
  let fetchedCount = 0;
  let skippedCount = 0;

  for (const source of sources) {
    // Check cooldown: skip if fetched within the last minute
    const recentRun = await prisma.sourceFetchRun.findFirst({
      where: {
        sourceId: source.id,
        createdAt: { gte: cooldownThreshold },
      },
    });

    if (recentRun) {
      skippedCount++;
      continue;
    }

    // Check for already running jobs
    const existingRun = await prisma.sourceFetchRun.findFirst({
      where: {
        sourceId: source.id,
        status: "RUNNING",
      },
    });

    if (existingRun) {
      skippedCount++;
      continue;
    }

    // Fetch directly (serverless-compatible, no worker required)
    await fetchSourceDirect(source.id, "MANUAL");
    fetchedCount++;
  }

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_RUN_STARTED",
      entityType: "Source",
      entityId: "refresh-by-type",
      action: `Refreshed ${type} sources: ${fetchedCount} fetched, ${skippedCount} skipped`,
    },
  });

  revalidatePath("/news");
  revalidatePath("/odds");
  revalidatePath("/results");
  revalidatePath("/dashboard");

  return {
    success: true,
    message: `Fetched ${fetchedCount} of ${sources.length} sources`,
    queuedCount: fetchedCount,
    skippedCount,
    totalSources: sources.length,
  };
}

/**
 * Get last fetch info for source types in a category.
 */
export async function getLastFetchInfo(
  type: "all" | "news" | "odds" | "results"
) {
  const { orgId } = await getTenantContext();

  let sourceTypes: SourceType[] | undefined;
  if (type === "news") sourceTypes = NEWS_SOURCE_TYPES;
  else if (type === "odds") sourceTypes = ODDS_SOURCE_TYPES;
  else if (type === "results") sourceTypes = RESULTS_SOURCE_TYPES;

  const sources = await prisma.source.findMany({
    where: {
      orgId,
      status: "ACTIVE",
      ...(sourceTypes ? { type: { in: sourceTypes } } : {}),
    },
    select: {
      lastFetchAt: true,
      lastSuccessAt: true,
      nextFetchAt: true,
    },
    orderBy: { lastFetchAt: "desc" },
  });

  if (sources.length === 0) {
    return { lastFetchAt: null, nextFetchAt: null, sourceCount: 0 };
  }

  // Most recent fetch across all sources in this category
  const lastFetchAt = sources
    .map((s) => s.lastFetchAt)
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

  // Nearest upcoming fetch
  const nextFetchAt = sources
    .map((s) => s.nextFetchAt)
    .filter(Boolean)
    .sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;

  return {
    lastFetchAt,
    nextFetchAt,
    sourceCount: sources.length,
  };
}
