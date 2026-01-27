import type { NewsItem, Sport } from "@prisma/client";
import { differenceInHours, differenceInMinutes } from "date-fns";

/**
 * Importance scoring service for news items.
 * Calculates importance scores based on multiple factors.
 */

export interface ImportanceFactors {
  // Time-based (30%)
  recency: number; // 0-1, exponential decay from publish time
  timeSensitivity: number; // 0-1, breaking news vs evergreen

  // Content-based (40%)
  entityRelevance: number; // 0-1, how relevant are mentioned entities
  topicWeight: number; // 0-1, trade > rumor > analysis
  exclusivity: number; // 0-1, first to report vs aggregated

  // Engagement-based (20%)
  sourceAuthority: number; // 0-1, ESPN > random blog

  // Context-based (10%)
  gameProximity: number; // 0-1, closer to game time = higher
  bettingRelevance: number; // 0-1, affects betting lines
}

export interface ScoreResult {
  totalScore: number; // 0-100
  breakdown: ImportanceFactors;
  reasoning: string;
}

// Weights for each factor
const WEIGHTS: Record<keyof ImportanceFactors, number> = {
  recency: 0.15,
  timeSensitivity: 0.15,
  entityRelevance: 0.15,
  topicWeight: 0.15,
  exclusivity: 0.1,
  sourceAuthority: 0.2,
  gameProximity: 0.05,
  bettingRelevance: 0.05,
};

// Topic weights (higher = more important)
const TOPIC_WEIGHTS: Record<string, number> = {
  TRADE: 0.95,
  BREAKING: 0.9,
  INJURY: 0.85,
  BETTING_LINE: 0.75,
  GAME_RESULT: 0.7,
  RUMOR: 0.6,
  SCHEDULE: 0.4,
  ANALYSIS: 0.3,
};

// Source authority scores (based on source name patterns)
const SOURCE_AUTHORITY_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /espn/i, score: 0.95 },
  { pattern: /nfl\.com|nba\.com|mlb\.com|nhl\.com/i, score: 0.95 },
  { pattern: /bleacher\s*report/i, score: 0.85 },
  { pattern: /athletic/i, score: 0.9 },
  { pattern: /yahoo\s*sports/i, score: 0.8 },
  { pattern: /cbs\s*sports/i, score: 0.85 },
  { pattern: /fox\s*sports/i, score: 0.85 },
  { pattern: /nbc\s*sports/i, score: 0.85 },
  { pattern: /draftkings|fanduel/i, score: 0.8 },
  { pattern: /twitter|x\.com/i, score: 0.7 },
  { pattern: /reddit/i, score: 0.5 },
];

/**
 * Calculate importance score for a news item.
 */
export function calculateImportanceScore(
  newsItem: NewsItem,
  sourceName?: string,
  upcomingGames?: Array<{ teams: string[]; gameDate: Date }>
): ScoreResult {
  const factors: ImportanceFactors = {
    recency: calculateRecency(newsItem.publishedAt),
    timeSensitivity: calculateTimeSensitivity(newsItem.type, newsItem.headline),
    entityRelevance: calculateEntityRelevance(
      newsItem.teams as string[],
      newsItem.players as string[],
      newsItem.sport
    ),
    topicWeight: calculateTopicWeight(newsItem.type),
    exclusivity: calculateExclusivity(newsItem.headline, newsItem.content),
    sourceAuthority: calculateSourceAuthority(sourceName || ""),
    gameProximity: calculateGameProximity(
      newsItem.teams as string[],
      upcomingGames || []
    ),
    bettingRelevance: calculateBettingRelevance(
      newsItem.type,
      newsItem.headline,
      newsItem.content
    ),
  };

  // Calculate weighted sum
  let totalScore = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    totalScore += factors[key as keyof ImportanceFactors] * weight;
  }

  // Scale to 0-100
  totalScore = Math.round(totalScore * 100);

  // Generate reasoning
  const reasoning = generateReasoning(factors, newsItem.type);

  return {
    totalScore,
    breakdown: factors,
    reasoning,
  };
}

/**
 * Calculate recency score with exponential decay.
 * Full score at 0 hours, 0.5 at 12 hours, ~0.1 at 48 hours.
 */
function calculateRecency(publishedAt: Date): number {
  const hoursAgo = differenceInHours(new Date(), publishedAt);

  if (hoursAgo <= 0) return 1;
  if (hoursAgo >= 72) return 0.05;

  // Exponential decay with half-life of ~12 hours
  return Math.exp(-hoursAgo / 17);
}

/**
 * Calculate time sensitivity based on news type and content.
 */
function calculateTimeSensitivity(type: string, headline: string): number {
  const lowerHeadline = headline.toLowerCase();

  // Breaking news indicators
  if (
    lowerHeadline.includes("breaking") ||
    lowerHeadline.includes("just in") ||
    lowerHeadline.includes("happening now") ||
    lowerHeadline.includes("developing")
  ) {
    return 1.0;
  }

  // Type-based sensitivity
  switch (type) {
    case "BREAKING":
      return 1.0;
    case "TRADE":
      return 0.9;
    case "INJURY":
      return 0.85;
    case "GAME_RESULT":
      return 0.7;
    case "BETTING_LINE":
      return 0.6;
    case "RUMOR":
      return 0.5;
    case "SCHEDULE":
      return 0.3;
    case "ANALYSIS":
      return 0.2;
    default:
      return 0.3;
  }
}

/**
 * Calculate entity relevance based on teams and players mentioned.
 */
function calculateEntityRelevance(
  teams: string[],
  players: string[],
  sport: Sport
): number {
  if (teams.length === 0 && players.length === 0) {
    return 0.2; // Generic sports news without specific entities
  }

  let score = 0.3; // Base score for having entities

  // More entities = generally more significant
  score += Math.min(teams.length * 0.15, 0.3);
  score += Math.min(players.length * 0.1, 0.4);

  return Math.min(score, 1.0);
}

/**
 * Calculate topic weight based on news type.
 */
function calculateTopicWeight(type: string): number {
  return TOPIC_WEIGHTS[type] || 0.3;
}

/**
 * Estimate exclusivity based on content analysis.
 * Breaking news with unique details scores higher.
 */
function calculateExclusivity(headline: string, content: string | null): number {
  const text = `${headline} ${content || ""}`.toLowerCase();

  // Exclusive indicators
  const exclusiveIndicators = [
    { pattern: /first to report/i, score: 0.3 },
    { pattern: /exclusive/i, score: 0.25 },
    { pattern: /breaking/i, score: 0.2 },
    { pattern: /sources tell|sources say|per sources/i, score: 0.15 },
    { pattern: /confirmed/i, score: 0.1 },
  ];

  let score = 0.3; // Base score

  for (const { pattern, score: bonus } of exclusiveIndicators) {
    if (pattern.test(text)) {
      score += bonus;
    }
  }

  // Aggregated/repost indicators (reduce score)
  if (/via\s+@|retweet|RT\s*:/i.test(text)) {
    score -= 0.2;
  }

  return Math.max(0, Math.min(score, 1.0));
}

/**
 * Calculate source authority score.
 */
function calculateSourceAuthority(sourceName: string): number {
  if (!sourceName) return 0.5;

  for (const { pattern, score } of SOURCE_AUTHORITY_PATTERNS) {
    if (pattern.test(sourceName)) {
      return score;
    }
  }

  return 0.5; // Default score for unknown sources
}

/**
 * Calculate game proximity score.
 * Higher score if news relates to a game happening soon.
 */
function calculateGameProximity(
  teams: string[],
  upcomingGames: Array<{ teams: string[]; gameDate: Date }>
): number {
  if (teams.length === 0 || upcomingGames.length === 0) {
    return 0.3;
  }

  const now = new Date();
  let closestGameHours = Infinity;

  for (const game of upcomingGames) {
    // Check if any team in the news is playing
    const hasMatchingTeam = teams.some((team) =>
      game.teams.some(
        (gameTeam) =>
          gameTeam.toLowerCase().includes(team.toLowerCase()) ||
          team.toLowerCase().includes(gameTeam.toLowerCase())
      )
    );

    if (hasMatchingTeam) {
      const hoursUntilGame = differenceInHours(game.gameDate, now);
      if (hoursUntilGame >= 0 && hoursUntilGame < closestGameHours) {
        closestGameHours = hoursUntilGame;
      }
    }
  }

  if (closestGameHours === Infinity) {
    return 0.3;
  }

  // Score based on proximity
  if (closestGameHours <= 2) return 1.0; // Game very soon
  if (closestGameHours <= 12) return 0.8;
  if (closestGameHours <= 24) return 0.6;
  if (closestGameHours <= 48) return 0.4;
  return 0.3;
}

/**
 * Calculate betting relevance score.
 */
function calculateBettingRelevance(
  type: string,
  headline: string,
  content: string | null
): number {
  if (type === "BETTING_LINE") return 1.0;

  const text = `${headline} ${content || ""}`.toLowerCase();

  // High betting relevance indicators
  const highRelevance = [
    /starter|starting lineup|will start/i,
    /out\s+(?:for|of)\s+(?:the\s+)?game/i,
    /ruled out|doubtful|questionable/i,
    /injury report/i,
    /line mov(?:e|ing|ement)/i,
    /spread|over\/under|moneyline/i,
  ];

  // Medium relevance
  const mediumRelevance = [
    /day-to-day/i,
    /limited practice/i,
    /probable/i,
    /game-time decision/i,
  ];

  for (const pattern of highRelevance) {
    if (pattern.test(text)) return 0.9;
  }

  for (const pattern of mediumRelevance) {
    if (pattern.test(text)) return 0.6;
  }

  // Type-based relevance
  if (type === "INJURY") return 0.7;
  if (type === "TRADE") return 0.5;
  if (type === "GAME_RESULT") return 0.4;

  return 0.2;
}

/**
 * Generate human-readable reasoning for the score.
 */
function generateReasoning(factors: ImportanceFactors, type: string): string {
  const reasons: string[] = [];

  // Recency
  if (factors.recency > 0.8) {
    reasons.push("Very recent news");
  } else if (factors.recency > 0.5) {
    reasons.push("Recent news");
  } else if (factors.recency < 0.2) {
    reasons.push("Older news");
  }

  // Topic
  if (factors.topicWeight > 0.8) {
    reasons.push(`High-impact ${type.toLowerCase().replace("_", " ")} news`);
  }

  // Source
  if (factors.sourceAuthority > 0.8) {
    reasons.push("From authoritative source");
  }

  // Exclusivity
  if (factors.exclusivity > 0.7) {
    reasons.push("Appears to be exclusive/breaking");
  }

  // Betting relevance
  if (factors.bettingRelevance > 0.7) {
    reasons.push("May affect betting lines");
  }

  // Game proximity
  if (factors.gameProximity > 0.7) {
    reasons.push("Relates to upcoming game");
  }

  return reasons.join(". ") || "Standard news item";
}

/**
 * Batch score multiple news items.
 */
export function batchCalculateImportance(
  items: NewsItem[],
  sourceName?: string
): Map<string, ScoreResult> {
  const results = new Map<string, ScoreResult>();

  for (const item of items) {
    results.set(item.id, calculateImportanceScore(item, sourceName));
  }

  return results;
}

/**
 * Get items sorted by importance score.
 */
export function sortByImportance(
  items: Array<{ id: string; importanceScore: number }>
): typeof items {
  return [...items].sort((a, b) => b.importanceScore - a.importanceScore);
}
