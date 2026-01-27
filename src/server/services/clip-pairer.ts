import { prisma } from "@/lib/prisma";
import type { NewsItem, Candidate, ClipMatchStatus } from "@prisma/client";
import { subDays } from "date-fns";

/**
 * Clip pairing service.
 * Matches news items with relevant video clips from the Candidate pool.
 */

export interface ClipMatchResult {
  candidateId: string;
  score: number;
  reason: string;
}

/**
 * Find matching clips for a news item.
 */
export async function findClipsForNews(
  newsItem: NewsItem
): Promise<ClipMatchResult[]> {
  const { orgId, teams, players, topics, publishedAt, sport } = newsItem;

  // Get candidates from the last 7 days that might be relevant
  const candidates = await prisma.candidate.findMany({
    where: {
      orgId,
      deletedAt: null,
      video: {
        publishedAt: { gte: subDays(publishedAt, 7) },
      },
      queryDefinition: {
        sport,
      },
    },
    include: {
      video: {
        select: {
          id: true,
          title: true,
          description: true,
          channelTitle: true,
          publishedAt: true,
        },
      },
    },
    orderBy: {
      relevanceScore: "desc",
    },
    take: 100, // Limit for performance
  });

  // Score each candidate for relevance to the news item
  const scoredMatches: ClipMatchResult[] = [];

  for (const candidate of candidates) {
    const matchResult = scoreClipMatch(newsItem, candidate);
    if (matchResult.score > 0.3) {
      // Minimum threshold
      scoredMatches.push({
        candidateId: candidate.id,
        score: matchResult.score,
        reason: matchResult.reason,
      });
    }
  }

  // Sort by score and return top matches
  return scoredMatches
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Return top 5 matches
}

/**
 * Score how well a candidate matches a news item.
 */
function scoreClipMatch(
  newsItem: NewsItem,
  candidate: Candidate & { video: { title: string; description: string | null } }
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const newsTeams = newsItem.teams as string[];
  const newsPlayers = newsItem.players as string[];
  const newsTopics = newsItem.topics as string[];

  const candidateEntities = candidate.entitiesJson as {
    people?: string[];
    teams?: string[];
    topics?: string[];
  };

  // Entity matching (60% of score)
  // Team matches
  const teamMatches = countMatches(newsTeams, candidateEntities.teams || []);
  if (teamMatches > 0) {
    score += 0.25 * Math.min(teamMatches, 2);
    reasons.push(`${teamMatches} team match(es)`);
  }

  // Player matches
  const playerMatches = countMatches(newsPlayers, candidateEntities.people || []);
  if (playerMatches > 0) {
    score += 0.2 * Math.min(playerMatches, 3);
    reasons.push(`${playerMatches} player match(es)`);
  }

  // Topic matches
  const topicMatches = countMatches(newsTopics, candidateEntities.topics || []);
  if (topicMatches > 0) {
    score += 0.15 * Math.min(topicMatches, 2);
    reasons.push(`${topicMatches} topic match(es)`);
  }

  // Text similarity (25% of score)
  const textScore = calculateTextSimilarity(
    newsItem.headline,
    `${candidate.video.title} ${candidate.video.description || ""}`
  );
  if (textScore > 0.3) {
    score += textScore * 0.25;
    reasons.push(`Text similarity: ${Math.round(textScore * 100)}%`);
  }

  // Temporal proximity (15% of score)
  const timeDiff = Math.abs(
    new Date(newsItem.publishedAt).getTime() -
      new Date(candidate.createdAt).getTime()
  );
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
  if (daysDiff < 1) {
    score += 0.15;
    reasons.push("Published same day");
  } else if (daysDiff < 3) {
    score += 0.1;
    reasons.push("Published within 3 days");
  } else if (daysDiff < 7) {
    score += 0.05;
    reasons.push("Published within a week");
  }

  // Candidate quality boost
  if (candidate.relevanceScore > 0.7) {
    score *= 1.1; // 10% boost for high-quality candidates
  }

  return {
    score: Math.min(score, 1.0), // Cap at 1.0
    reason: reasons.join("; ") || "Low relevance",
  };
}

/**
 * Count matching items between two arrays (case-insensitive).
 */
function countMatches(arr1: string[], arr2: string[]): number {
  const set1 = new Set(arr1.map((s) => s.toLowerCase()));
  const set2 = new Set(arr2.map((s) => s.toLowerCase()));

  let matches = 0;
  for (const item of set1) {
    // Check for exact match or partial match
    if (set2.has(item)) {
      matches++;
    } else {
      // Check for partial matches (e.g., "LeBron" matches "LeBron James")
      for (const item2 of set2) {
        if (item.includes(item2) || item2.includes(item)) {
          matches += 0.5; // Partial match
          break;
        }
      }
    }
  }

  return matches;
}

/**
 * Calculate text similarity using token overlap (Jaccard-like).
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0;
  }

  const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

/**
 * Tokenize text for similarity comparison.
 */
function tokenize(text: string): Set<string> {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can", "this",
    "that", "these", "those", "it", "its", "i", "you", "he", "she", "we",
    "they", "what", "which", "who", "whom", "how", "when", "where", "why",
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
  );
}

/**
 * Create clip matches in the database.
 */
export async function createClipMatches(
  orgId: string,
  newsItemId: string,
  matches: ClipMatchResult[]
): Promise<void> {
  // Delete existing matches for this news item
  await prisma.clipMatch.deleteMany({
    where: { newsItemId },
  });

  // Create new matches
  for (const match of matches) {
    await prisma.clipMatch.create({
      data: {
        orgId,
        newsItemId,
        candidateId: match.candidateId,
        status: "PENDING" as ClipMatchStatus,
        matchScore: match.score,
        matchReason: match.reason,
      },
    });
  }

  // Update news item to mark as paired
  if (matches.length > 0) {
    await prisma.newsItem.update({
      where: { id: newsItemId },
      data: { isPaired: true },
    });
  }
}

/**
 * Get clip matches for a news item.
 */
export async function getClipMatches(newsItemId: string) {
  return prisma.clipMatch.findMany({
    where: { newsItemId },
    include: {
      candidate: {
        include: {
          video: true,
          moments: true,
        },
      },
    },
    orderBy: { matchScore: "desc" },
  });
}

/**
 * Update clip match status.
 */
export async function updateClipMatchStatus(
  clipMatchId: string,
  status: ClipMatchStatus
): Promise<void> {
  await prisma.clipMatch.update({
    where: { id: clipMatchId },
    data: { status },
  });
}

/**
 * Get unmatched news items that need clip pairing.
 */
export async function getUnmatchedNewsItems(
  orgId: string,
  limit: number = 50
): Promise<NewsItem[]> {
  return prisma.newsItem.findMany({
    where: {
      orgId,
      isProcessed: true,
      isPaired: false,
      importanceScore: { gte: 40 }, // Only high-importance items
    },
    orderBy: { importanceScore: "desc" },
    take: limit,
  });
}

/**
 * Get stats for clip matching.
 */
export async function getClipMatchStats(orgId: string) {
  const [totalNews, matched, pending, dismissed] = await Promise.all([
    prisma.newsItem.count({
      where: { orgId, isProcessed: true },
    }),
    prisma.clipMatch.count({
      where: { orgId, status: "MATCHED" },
    }),
    prisma.clipMatch.count({
      where: { orgId, status: "PENDING" },
    }),
    prisma.clipMatch.count({
      where: { orgId, status: "DISMISSED" },
    }),
  ]);

  return {
    totalNews,
    matched,
    pending,
    dismissed,
    matchRate: totalNews > 0 ? (matched / totalNews) * 100 : 0,
  };
}
