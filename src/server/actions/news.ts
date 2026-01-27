"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-prisma";
import { sourceFetchQueue } from "@/lib/queue";
import type { ClipMatchStatus, Sport } from "@prisma/client";

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

  // Queue fetch jobs for each source
  const now = new Date();
  let queuedCount = 0;

  for (const source of sources) {
    // Check for existing running fetch
    const existingRun = await prisma.sourceFetchRun.findFirst({
      where: {
        sourceId: source.id,
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });

    if (existingRun) {
      continue; // Skip if already running
    }

    // Create fetch run
    const fetchRun = await prisma.sourceFetchRun.create({
      data: {
        sourceId: source.id,
        status: "QUEUED",
        triggeredBy: "MANUAL",
        startedAt: now,
      },
    });

    // Queue the job
    await sourceFetchQueue.add(
      "manual-refresh-all",
      {
        sourceId: source.id,
        fetchRunId: fetchRun.id,
        orgId,
        triggeredBy: "MANUAL",
      },
      { priority: 1 } // High priority for manual runs
    );

    queuedCount++;
  }

  // Create audit event
  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: userId,
      eventType: "QUERY_RUN_STARTED",
      entityType: "Source",
      entityId: "all",
      action: `Triggered refresh of ${queuedCount} sources${sport ? ` for ${sport}` : ""}`,
    },
  });

  revalidatePath("/admin/sources");
  revalidatePath("/dashboard");

  return {
    success: true,
    message: `Queued ${queuedCount} of ${sources.length} sources for refresh`,
    queuedCount,
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
