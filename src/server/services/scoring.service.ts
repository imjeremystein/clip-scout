import { getEmbedding, cosineSimilarity } from "@/lib/openai";

export interface ScoringInput {
  transcript: string;
  videoTitle: string;
  channelName: string;
  viewCount?: number | null;
  likeCount?: number | null;
  publishedAt: Date;
  durationSeconds?: number | null;
}

export interface ScoringWeights {
  embeddingSimilarity: number;
  keywordDensity: number;
  recencyBoost: number;
  engagementScore: number;
  titleRelevance: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  embeddingSimilarity: 0.40,
  keywordDensity: 0.20,
  recencyBoost: 0.15,
  engagementScore: 0.10,
  titleRelevance: 0.15,
};

/**
 * Calculate keyword density score
 */
export function calculateKeywordDensity(
  text: string,
  keywords: string[]
): number {
  if (keywords.length === 0) return 0;

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/).length;

  let matchCount = 0;
  let totalOccurrences = 0;

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    const regex = new RegExp(`\\b${escapeRegex(lowerKeyword)}\\b`, "gi");
    const matches = lowerText.match(regex);

    if (matches && matches.length > 0) {
      matchCount++;
      totalOccurrences += matches.length;
    }
  }

  // Keyword coverage (what percentage of keywords appear)
  const coverage = matchCount / keywords.length;

  // Keyword frequency (occurrences per 1000 words, capped)
  const frequency = Math.min(totalOccurrences / (words / 1000), 10) / 10;

  // Combined score
  return coverage * 0.7 + frequency * 0.3;
}

/**
 * Calculate recency boost (newer videos score higher)
 */
export function calculateRecencyBoost(
  publishedAt: Date,
  maxDaysOld: number = 30
): number {
  const now = new Date();
  const ageMs = now.getTime() - publishedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 1) return 1.0; // Published today
  if (ageDays <= 7) return 0.9; // This week
  if (ageDays <= 14) return 0.7; // Last two weeks
  if (ageDays <= maxDaysOld) return 0.5; // Within range
  return 0.3; // Older
}

/**
 * Calculate engagement score based on view and like counts
 */
export function calculateEngagementScore(
  viewCount?: number | null,
  likeCount?: number | null
): number {
  if (!viewCount) return 0.5; // Neutral if no data

  // Log scale for view count (videos with more views score higher)
  const viewScore = Math.min(Math.log10(viewCount + 1) / 7, 1); // Cap at 10M views

  // Like ratio if available
  let likeRatio = 0.5;
  if (likeCount && viewCount > 0) {
    likeRatio = Math.min(likeCount / viewCount, 0.1) * 10; // Cap at 10% like ratio
  }

  return viewScore * 0.7 + likeRatio * 0.3;
}

/**
 * Calculate title relevance to keywords
 */
export function calculateTitleRelevance(
  title: string,
  keywords: string[]
): number {
  const lowerTitle = title.toLowerCase();
  let matches = 0;

  for (const keyword of keywords) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      matches++;
    }
  }

  return keywords.length > 0 ? matches / keywords.length : 0;
}

/**
 * Calculate comprehensive relevance score using multiple signals
 */
export async function calculateRelevanceScore(
  input: ScoringInput,
  keywords: string[],
  sport: string,
  useEmbeddings: boolean = true,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): Promise<{
  totalScore: number;
  breakdown: Record<string, number>;
}> {
  const breakdown: Record<string, number> = {};

  // 1. Embedding similarity (if enabled)
  let embeddingScore = 0.5; // Default neutral score
  if (useEmbeddings && keywords.length > 0) {
    try {
      const queryText = `${sport} ${keywords.join(" ")}`;
      const queryEmbedding = await getEmbedding(queryText);

      // Get embedding for transcript sample (first 2000 chars for efficiency)
      const transcriptSample = input.transcript.slice(0, 2000);
      const transcriptEmbedding = await getEmbedding(transcriptSample);

      embeddingScore = cosineSimilarity(queryEmbedding, transcriptEmbedding);
      // Normalize to 0-1 range (cosine similarity is already -1 to 1, but for text it's usually 0-1)
      embeddingScore = Math.max(0, embeddingScore);
    } catch (error) {
      console.error("Embedding calculation failed:", error);
    }
  }
  breakdown.embeddingSimilarity = embeddingScore;

  // 2. Keyword density
  const keywordScore = calculateKeywordDensity(input.transcript, keywords);
  breakdown.keywordDensity = keywordScore;

  // 3. Recency boost
  const recencyScore = calculateRecencyBoost(input.publishedAt);
  breakdown.recencyBoost = recencyScore;

  // 4. Engagement score
  const engagementScore = calculateEngagementScore(
    input.viewCount,
    input.likeCount
  );
  breakdown.engagementScore = engagementScore;

  // 5. Title relevance
  const titleScore = calculateTitleRelevance(input.videoTitle, keywords);
  breakdown.titleRelevance = titleScore;

  // Calculate weighted total
  const totalScore =
    embeddingScore * weights.embeddingSimilarity +
    keywordScore * weights.keywordDensity +
    recencyScore * weights.recencyBoost +
    engagementScore * weights.engagementScore +
    titleScore * weights.titleRelevance;

  return {
    totalScore: Math.max(0, Math.min(1, totalScore)), // Clamp to 0-1
    breakdown,
  };
}

/**
 * Simple keyword-based scoring (faster, no API calls)
 */
export function calculateSimpleScore(
  transcript: string,
  title: string,
  keywords: string[]
): number {
  const transcriptScore = calculateKeywordDensity(transcript, keywords);
  const titleScore = calculateTitleRelevance(title, keywords);

  return transcriptScore * 0.7 + titleScore * 0.3;
}

// Helper to escape regex special characters
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
