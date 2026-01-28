import type { Source, Sport } from "@prisma/client";
import type {
  FetchOptions,
  FetchResult,
  ValidationResult,
  RawNewsItem,
  RawGameResult,
  EspnConfig,
  NewsItemType,
} from "./types";
import { BaseAdapter, type ResultsAdapter } from "./base-adapter";

// ESPN API endpoints (unofficial - public API)
const ESPN_API_BASE = "https://site.api.espn.com/apis/site/v2";
const ESPN_NEWS_BASE = "https://now.core.api.espn.com/v1/sports";

// Sport to ESPN sport mapping
const SPORT_MAP: Record<Sport, { sport: string; league: string }> = {
  NFL: { sport: "football", league: "nfl" },
  NBA: { sport: "basketball", league: "nba" },
  MLB: { sport: "baseball", league: "mlb" },
  NHL: { sport: "hockey", league: "nhl" },
  CBB: { sport: "basketball", league: "mens-college-basketball" },
  CFB: { sport: "football", league: "college-football" },
  SOCCER: { sport: "soccer", league: "usa.1" }, // MLS
  BOXING: { sport: "mma", league: "ufc" }, // Closest ESPN equivalent
  SPORTS_BETTING: { sport: "football", league: "nfl" }, // Default to NFL
};

// Rate limit: 60 requests per minute
const RATE_LIMIT_TOTAL = 60;
const RATE_LIMIT_WINDOW_MS = 60000;

/**
 * ESPN Adapter
 * Fetches sports news and game results from ESPN's public API.
 */
export class EspnAdapter extends BaseAdapter implements ResultsAdapter {
  readonly type = "ESPN_API" as const;
  readonly name = "ESPN";

  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor() {
    super();
    this.rateLimitTotal = RATE_LIMIT_TOTAL;
    this.rateLimitRemaining = RATE_LIMIT_TOTAL;
  }

  async fetch(source: Source, options?: FetchOptions): Promise<FetchResult> {
    const config = this.parseConfig<EspnConfig>(source);

    // Get sport mapping
    const sportMapping = SPORT_MAP[source.sport] || SPORT_MAP.NFL;
    const sport = config.sport || sportMapping.sport;
    const league = config.league || sportMapping.league;

    // Check and update rate limit
    this.checkRateLimit();

    switch (config.section) {
      case "news":
        return this.fetchNews(source, sport, league, options);
      case "scores":
        return this.fetchScoresAsNews(source, sport, league, options);
      default:
        return this.fetchNews(source, sport, league, options);
    }
  }

  async fetchResults(source: Source, options?: FetchOptions): Promise<RawGameResult[]> {
    const config = this.parseConfig<EspnConfig>(source);
    const sportMapping = SPORT_MAP[source.sport] || SPORT_MAP.NFL;
    const sport = config.sport || sportMapping.sport;
    const league = config.league || sportMapping.league;

    this.checkRateLimit();

    const url = `${ESPN_API_BASE}/sports/${sport}/${league}/scoreboard`;
    const response = await this.fetchApi(url);
    const data = await response.json();

    const results: RawGameResult[] = [];

    for (const event of data.events || []) {
      const competition = event.competitions?.[0];
      if (!competition) continue;

      const homeTeam = competition.competitors?.find((c: { homeAway: string }) => c.homeAway === "home");
      const awayTeam = competition.competitors?.find((c: { homeAway: string }) => c.homeAway === "away");

      if (!homeTeam || !awayTeam) continue;

      results.push({
        externalGameId: event.id,
        homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || "Unknown",
        awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || "Unknown",
        gameDate: new Date(event.date),
        homeScore: parseInt(homeTeam.score, 10) || undefined,
        awayScore: parseInt(awayTeam.score, 10) || undefined,
        status: event.status?.type?.name || "SCHEDULED",
        statsJson: {
          venue: competition.venue?.fullName,
          attendance: competition.attendance,
          broadcasts: competition.broadcasts,
        },
        rawData: event,
      });
    }

    return results;
  }

  validateConfig(config: unknown): ValidationResult {
    if (!config || typeof config !== "object") {
      return this.validationError(["Configuration must be an object"]);
    }

    const cfg = config as Record<string, unknown>;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required: section
    const validSections = ["news", "scores", "odds", "standings"];
    if (!cfg.section || typeof cfg.section !== "string") {
      errors.push("section is required (news, scores, odds, or standings)");
    } else if (!validSections.includes(cfg.section)) {
      errors.push(`section must be one of: ${validSections.join(", ")}`);
    }

    // Optional: sport override
    if (cfg.sport && typeof cfg.sport !== "string") {
      errors.push("sport must be a string if provided");
    }

    // Optional: league override
    if (cfg.league && typeof cfg.league !== "string") {
      errors.push("league must be a string if provided");
    }

    // Optional: team filter
    if (cfg.team) {
      warnings.push("Team filtering is not yet fully implemented");
    }

    if (errors.length > 0) {
      return this.validationError(errors);
    }

    return this.validationSuccess(warnings);
  }

  async testConnection(config: EspnConfig): Promise<boolean> {
    try {
      const sport = config.sport || "football";
      const league = config.league || "nfl";
      const url = `${ESPN_API_BASE}/sports/${sport}/${league}/news`;
      const response = await this.fetchApi(url);
      const data = await response.json();
      return Array.isArray(data.articles) && data.articles.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Fetch news articles from ESPN.
   */
  private async fetchNews(
    source: Source,
    sport: string,
    league: string,
    options?: FetchOptions
  ): Promise<FetchResult> {
    const url = `${ESPN_API_BASE}/sports/${sport}/${league}/news`;
    const response = await this.fetchApi(url);
    const data = await response.json();

    const items: RawNewsItem[] = [];

    for (const article of data.articles || []) {
      // Skip if older than 'since' date
      const publishedAt = new Date(article.published);
      if (options?.since && publishedAt < options.since) {
        continue;
      }

      // Respect limit
      if (options?.limit && items.length >= options.limit) {
        break;
      }

      const item = this.parseArticle(article, source.sport);
      if (item) {
        items.push(item);
      }
    }

    return {
      items,
      hasMore: false,
      rateLimitRemaining: this.rateLimitRemaining,
      rateLimitReset: this.rateLimitReset,
      metadata: {
        sport,
        league,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Fetch scores and convert to news items.
   */
  private async fetchScoresAsNews(
    source: Source,
    sport: string,
    league: string,
    options?: FetchOptions
  ): Promise<FetchResult> {
    const url = `${ESPN_API_BASE}/sports/${sport}/${league}/scoreboard`;
    const response = await this.fetchApi(url);
    const data = await response.json();

    const items: RawNewsItem[] = [];

    for (const event of data.events || []) {
      // Respect limit
      if (options?.limit && items.length >= options.limit) {
        break;
      }

      const item = this.parseGameAsNews(event, source.sport);
      if (item) {
        items.push(item);
      }
    }

    return {
      items,
      hasMore: false,
      rateLimitRemaining: this.rateLimitRemaining,
      rateLimitReset: this.rateLimitReset,
      metadata: {
        sport,
        league,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Parse an ESPN article into a RawNewsItem.
   */
  private parseArticle(article: Record<string, unknown>, sport: Sport): RawNewsItem | null {
    if (!article.headline) {
      return null;
    }

    const headline = String(article.headline);
    const description = article.description ? String(article.description) : undefined;

    // Determine news type from content
    const type = this.inferNewsType(headline, description || "");

    // Get image URL
    let imageUrl: string | undefined;
    if (Array.isArray(article.images) && article.images.length > 0) {
      const image = article.images[0] as Record<string, unknown>;
      imageUrl = image.url as string | undefined;
    }

    return {
      externalId: `espn-${article.id || this.hashString(headline)}`,
      type,
      headline,
      content: description,
      url: (article.links as Record<string, unknown>)?.web ? ((article.links as Record<string, Record<string, unknown>>).web.href as string | undefined) : undefined,
      imageUrl,
      publishedAt: new Date(article.published as string),
      author: article.byline as string | undefined,
      rawData: article,
    };
  }

  /**
   * Parse a game event into a news item.
   */
  private parseGameAsNews(event: Record<string, unknown>, sport: Sport): RawNewsItem | null {
    const competition = (event.competitions as unknown[])?.[0] as Record<string, unknown> | undefined;
    if (!competition) return null;

    const competitors = competition.competitors as Array<Record<string, unknown>> | undefined;
    if (!competitors || competitors.length < 2) return null;

    const homeTeam = competitors.find((c) => c.homeAway === "home");
    const awayTeam = competitors.find((c) => c.homeAway === "away");
    if (!homeTeam || !awayTeam) return null;

    const homeName =
      (homeTeam.team as Record<string, unknown>)?.displayName ||
      (homeTeam.team as Record<string, unknown>)?.name ||
      "Home";
    const awayName =
      (awayTeam.team as Record<string, unknown>)?.displayName ||
      (awayTeam.team as Record<string, unknown>)?.name ||
      "Away";
    const homeScore = homeTeam.score;
    const awayScore = awayTeam.score;

    const status = (event.status as Record<string, unknown>)?.type as Record<string, unknown> | undefined;
    const statusName = status?.name || "scheduled";
    const statusDetail = status?.detail || status?.shortDetail;

    let headline: string;
    let type: NewsItemType = "GAME_RESULT";

    if (statusName === "STATUS_FINAL") {
      const winner = Number(homeScore) > Number(awayScore) ? homeName : awayName;
      const loser = Number(homeScore) > Number(awayScore) ? awayName : homeName;
      const winScore = Math.max(Number(homeScore), Number(awayScore));
      const loseScore = Math.min(Number(homeScore), Number(awayScore));
      headline = `${winner} defeats ${loser} ${winScore}-${loseScore}`;
    } else if (statusName === "STATUS_IN_PROGRESS") {
      headline = `${awayName} @ ${homeName}: ${awayScore}-${homeScore} (${statusDetail})`;
      type = "BREAKING";
    } else {
      headline = `${awayName} @ ${homeName} - ${statusDetail || "Scheduled"}`;
      type = "SCHEDULE";
    }

    return {
      externalId: `espn-game-${event.id}`,
      type,
      headline,
      content: event.name as string | undefined,
      url: Array.isArray(event.links) && event.links[0] ? (event.links[0] as Record<string, unknown>).href as string | undefined : undefined,
      imageUrl: undefined,
      publishedAt: new Date(event.date as string),
      author: "ESPN",
      rawData: event,
    };
  }

  /**
   * Infer news type from content.
   */
  private inferNewsType(title: string, content: string): NewsItemType {
    const text = `${title} ${content}`.toLowerCase();

    if (text.includes("trade") || text.includes("traded") || text.includes("deal")) {
      return "TRADE";
    }
    if (
      text.includes("injury") ||
      text.includes("injured") ||
      text.includes("out for") ||
      text.includes("day-to-day") ||
      text.includes("questionable")
    ) {
      return "INJURY";
    }
    if (text.includes("breaking") || text.includes("just in") || text.includes("developing")) {
      return "BREAKING";
    }
    if (
      text.includes("final") ||
      text.includes("wins") ||
      text.includes("defeats") ||
      text.includes("beat")
    ) {
      return "GAME_RESULT";
    }
    if (text.includes("rumor") || text.includes("reportedly") || text.includes("sources")) {
      return "RUMOR";
    }

    return "ANALYSIS";
  }

  /**
   * Fetch from ESPN API with rate limiting.
   */
  private async fetchApi(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.SCRAPER_USER_AGENT || "ClipScout/1.0",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
    }

    this.requestCount++;
    this.rateLimitRemaining = Math.max(0, RATE_LIMIT_TOTAL - this.requestCount);

    return response;
  }

  /**
   * Check and reset rate limit window if needed.
   */
  private checkRateLimit(): void {
    const now = Date.now();
    if (now - this.windowStart >= RATE_LIMIT_WINDOW_MS) {
      this.windowStart = now;
      this.requestCount = 0;
      this.rateLimitRemaining = RATE_LIMIT_TOTAL;
      this.rateLimitReset = undefined;
    }

    if (this.requestCount >= RATE_LIMIT_TOTAL) {
      this.rateLimitReset = new Date(this.windowStart + RATE_LIMIT_WINDOW_MS);
      throw new Error(`Rate limited. Reset at ${this.rateLimitReset.toISOString()}`);
    }
  }

  /**
   * Create a hash from a string.
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

// Export singleton instance
export const espnAdapter = new EspnAdapter();
