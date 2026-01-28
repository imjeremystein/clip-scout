import type { SourceType, SourceStatus, NewsItemType, Sport, Source } from "@prisma/client";

// ============================================================================
// Source Configuration Types (stored in Source.config JSON field)
// ============================================================================

export interface TwitterSearchConfig {
  searchQuery: string;
  bearerToken?: string; // Can use env var if not set
  includeRetweets?: boolean;
  maxResults?: number;
}

export interface TwitterListConfig {
  listId: string;
  bearerToken?: string;
  maxResults?: number;
}

export interface RssFeedConfig {
  feedUrl: string;
  itemSelector?: string; // Custom item selector if needed
  maxItems?: number;
}

export interface WebsiteScraperConfig {
  url: string;
  selectors: {
    container?: string; // Container for news items
    headline: string;
    content?: string;
    date?: string;
    author?: string;
    link?: string;
    image?: string;
  };
  pagination?: {
    nextSelector?: string;
    maxPages?: number;
  };
  waitForSelector?: string; // For dynamic sites
  maxItems?: number;
}

export interface SportsGridConfig {
  sport?: string; // Optional sport override (NBA, NFL, MLB, NHL, CBB, CFB)
  apiToken?: string; // Bearer token for authenticated API
}

export interface EspnConfig {
  sport: string;
  section: "news" | "scores" | "odds" | "standings";
  team?: string; // Optional team filter
  league?: string;
}

export type SourceConfig =
  | TwitterSearchConfig
  | TwitterListConfig
  | RssFeedConfig
  | WebsiteScraperConfig
  | SportsGridConfig
  | EspnConfig;

// ============================================================================
// Fetch Types
// ============================================================================

export interface FetchOptions {
  since?: Date; // Only fetch items after this date
  limit?: number; // Max items to fetch
  dryRun?: boolean; // Don't persist, just return items
}

export interface FetchResult {
  items: RawNewsItem[];
  hasMore: boolean;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
  metadata?: Record<string, unknown>;
}

export interface RawNewsItem {
  externalId: string;
  type: NewsItemType;
  headline: string;
  content?: string;
  url?: string;
  imageUrl?: string;
  publishedAt: Date;
  author?: string;
  rawData: unknown; // Original API response
}

export interface RawOddsData {
  externalGameId?: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: Date;
  homeMoneyline?: number;
  awayMoneyline?: number;
  spread?: number;
  spreadJuice?: number;
  overUnder?: number;
  overJuice?: number;
  underJuice?: number;
  rawData: unknown;
}

export interface RawGameResult {
  externalGameId?: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: Date;
  homeScore?: number;
  awayScore?: number;
  status: string;
  statsJson?: Record<string, unknown>;
  rawData: unknown;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt?: Date;
  isLimited: boolean;
}

// ============================================================================
// Re-export Prisma types for convenience
// ============================================================================

export type { SourceType, SourceStatus, NewsItemType, Sport, Source };
