import { prisma } from "@/lib/prisma";
import type {
  DashboardStats,
  RecentRun,
  TopCandidate,
  ScheduledRun,
} from "@/types";

/**
 * Get dashboard statistics for an organization
 */
export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(startOfToday);
  yesterday.setDate(yesterday.getDate() - 1);

  const [totalQueries, runsToday, candidatesFound, shortlisted] = await Promise.all([
    // Total active queries
    prisma.queryDefinition.count({
      where: {
        orgId,
        deletedAt: null,
        isActive: true,
      },
    }),
    // Runs today
    prisma.queryRun.count({
      where: {
        orgId,
        createdAt: { gte: startOfToday },
      },
    }),
    // Total candidates found
    prisma.candidate.count({
      where: {
        orgId,
        deletedAt: null,
      },
    }),
    // Shortlisted candidates
    prisma.candidate.count({
      where: {
        orgId,
        status: "SHORTLISTED",
        deletedAt: null,
      },
    }),
  ]);

  return {
    totalQueries,
    runsToday,
    candidatesFound,
    shortlisted,
  };
}

/**
 * Get recent query runs for the dashboard
 */
export async function getRecentRuns(orgId: string, limit = 5): Promise<RecentRun[]> {
  const runs = await prisma.queryRun.findMany({
    where: { orgId },
    include: {
      queryDefinition: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return runs.map((run) => ({
    id: run.id,
    queryName: run.queryDefinition.name,
    status: run.status,
    candidatesFound: run.candidatesProduced,
    createdAt: run.createdAt,
  }));
}

/**
 * Get top candidates for today
 */
export async function getTopCandidatesToday(
  orgId: string,
  limit = 5
): Promise<TopCandidate[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const candidates = await prisma.candidate.findMany({
    where: {
      orgId,
      createdAt: { gte: startOfToday },
      deletedAt: null,
    },
    include: {
      video: {
        select: {
          youtubeVideoId: true,
          title: true,
          channelTitle: true,
        },
      },
      queryDefinition: {
        select: { sport: true },
      },
    },
    orderBy: { relevanceScore: "desc" },
    take: limit,
  });

  return candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.video.title,
    channelName: candidate.video.channelTitle,
    score: candidate.relevanceScore,
    sport: candidate.queryDefinition.sport,
    videoId: candidate.video.youtubeVideoId,
  }));
}

/**
 * Get next scheduled runs
 */
export async function getScheduledRuns(orgId: string, limit = 5): Promise<ScheduledRun[]> {
  const queries = await prisma.queryDefinition.findMany({
    where: {
      orgId,
      isScheduled: true,
      isActive: true,
      deletedAt: null,
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });

  return queries.map((query) => ({
    id: query.id,
    queryName: query.name,
    nextRunAt: query.nextRunAt,
    scheduleType: query.scheduleType,
  }));
}

/**
 * Get activity feed for managers
 */
export async function getActivityFeed(orgId: string, limit = 20) {
  return prisma.auditEvent.findMany({
    where: { orgId },
    include: {
      actorUser: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
