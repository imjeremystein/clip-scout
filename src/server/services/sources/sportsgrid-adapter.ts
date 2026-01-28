import type { Source, Sport } from "@prisma/client";
import type {
  FetchOptions,
  FetchResult,
  ValidationResult,
  RawNewsItem,
  RawOddsData,
  RawGameResult,
  NewsItemType,
} from "./types";
import { BaseAdapter, type OddsAdapter, type ResultsAdapter } from "./base-adapter";

// SportsGrid authenticated API endpoint
const SPORTSGRID_API_URL = "https://app.sportsgrid.com/api/v1/getSingleSportGamesData";

// Sport to SportsGrid sport name mapping (uppercase for new API)
const SPORT_MAP: Record<Sport, string> = {
  NFL: "NFL",
  NBA: "NBA",
  MLB: "MLB",
  NHL: "NHL",
  SOCCER: "Soccer",
  BOXING: "Boxing",
  SPORTS_BETTING: "NFL", // Default to NFL
};

// Self-imposed rate limiting: 10 requests per minute, 6s between requests
const MIN_REQUEST_INTERVAL_MS = 6000;
const RATE_LIMIT_TOTAL = 10;
const RATE_LIMIT_WINDOW_MS = 60000;

/**
 * SportsGrid config stored in Source.config JSON field.
 */
export interface SportsGridConfig {
  sport?: string; // Optional sport override (NBA, NFL, MLB, NHL, CBB, CFB)
  apiToken?: string; // Bearer token for authenticated API
}

/**
 * Extended fetch options for SportsGrid that supports date parameter.
 */
export interface SportsGridFetchOptions extends FetchOptions {
  date?: string; // Specific date to fetch (YYYY-MM-DD format)
}

/**
 * SportsGrid Adapter
 * Fetches betting odds and game results from SportsGrid's authenticated API.
 */
export class SportsGridAdapter extends BaseAdapter implements OddsAdapter, ResultsAdapter {
  readonly type = "SPORTSGRID_API" as const;
  readonly name = "SportsGrid";

  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor() {
    super();
    this.rateLimitTotal = RATE_LIMIT_TOTAL;
    this.rateLimitRemaining = RATE_LIMIT_TOTAL;
  }

  async fetch(source: Source, options?: FetchOptions): Promise<FetchResult> {
    const odds = await this.fetchOdds(source, options);

    const items: RawNewsItem[] = odds.map((odd) => this.oddsToNewsItem(odd, source.sport));

    return {
      items,
      hasMore: false,
      rateLimitRemaining: this.rateLimitRemaining,
      rateLimitReset: this.rateLimitReset,
      metadata: {
        oddsCount: odds.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  async fetchOdds(source: Source, options?: SportsGridFetchOptions): Promise<RawOddsData[]> {
    const config = this.parseConfig<SportsGridConfig>(source);

    // Get sport name for API (use config override or map from source.sport)
    const sportName = config.sport || SPORT_MAP[source.sport] || "NFL";

    // Use provided date or default to today
    const date = options?.date || new Date().toISOString().split('T')[0];

    // Respect rate limiting
    await this.waitForRateLimit();

    try {
      const games = await this.fetchGames(sportName, config, date);

      const odds: RawOddsData[] = [];

      for (const game of games) {
        // Respect limit
        if (options?.limit && odds.length >= options.limit) {
          break;
        }

        // Only include non-final games for odds
        if (!game.final) {
          const oddData = this.parseGameToOdds(game, source.sport);
          if (oddData) {
            odds.push(oddData);
          }
        }
      }

      return odds;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch SportsGrid odds: ${errorMessage}`);
    }
  }

  /**
   * Fetch game results (completed games with final scores).
   * @param source - The source configuration
   * @param options - Fetch options, including optional date parameter
   * @returns Array of game results
   */
  async fetchResults(source: Source, options?: SportsGridFetchOptions): Promise<RawGameResult[]> {
    const config = this.parseConfig<SportsGridConfig>(source);

    // Get sport name for API (use config override or map from source.sport)
    const sportName = config.sport || SPORT_MAP[source.sport] || "NFL";

    // Use provided date or default to yesterday (most likely to have final results)
    const date = options?.date || this.getYesterdayDate();

    // Respect rate limiting
    await this.waitForRateLimit();

    try {
      const games = await this.fetchGames(sportName, config, date);

      const results: RawGameResult[] = [];

      for (const game of games) {
        // Respect limit
        if (options?.limit && results.length >= options.limit) {
          break;
        }

        // Only include final games
        if (game.final) {
          const result = this.parseGameToResult(game);
          if (result) {
            results.push(result);
          }
        }
      }

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch SportsGrid results: ${errorMessage}`);
    }
  }

  /**
   * Fetch games for a specific date range.
   * Useful for backfilling historical results.
   */
  async fetchResultsForDateRange(
    source: Source,
    startDate: string,
    endDate: string,
    options?: FetchOptions
  ): Promise<RawGameResult[]> {
    const results: RawGameResult[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let date = start; date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      const dayResults = await this.fetchResults(source, { ...options, date: dateStr });
      results.push(...dayResults);

      // Check limit
      if (options?.limit && results.length >= options.limit) {
        return results.slice(0, options.limit);
      }
    }

    return results;
  }

  validateConfig(config: unknown): ValidationResult {
    if (!config || typeof config !== "object") {
      return this.validationError(["Configuration must be an object"]);
    }

    const cfg = config as Record<string, unknown>;
    const warnings: string[] = [];

    // Optional: sport override
    if (cfg.sport !== undefined && typeof cfg.sport !== "string") {
      return this.validationError(["sport must be a string if provided (e.g., 'NFL', 'NBA', 'MLB')"]);
    }

    // Optional: API token (will fall back to env var)
    if (cfg.apiToken !== undefined && typeof cfg.apiToken !== "string") {
      return this.validationError(["apiToken must be a string if provided"]);
    }

    // Add info about rate limiting
    warnings.push("SportsGrid API has self-imposed rate limiting. Recommended refresh interval: 10+ minutes.");

    return this.validationSuccess(warnings);
  }

  async testConnection(config: SportsGridConfig): Promise<boolean> {
    try {
      const sport = config.sport || "NFL";
      const games = await this.fetchGames(sport, config);
      return Array.isArray(games);
    } catch {
      return false;
    }
  }

  /**
   * Fetch games from SportsGrid authenticated API.
   */
  private async fetchGames(
    sport: string,
    config: SportsGridConfig,
    date?: string
  ): Promise<SportsGridGame[]> {
    const token = config.apiToken || process.env.SPORTSGRID_API_TOKEN;

    if (!token) {
      throw new Error("SportsGrid API token is required. Set SPORTSGRID_API_TOKEN env var or provide apiToken in config.");
    }

    const fetchDate = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const response = await fetch(SPORTSGRID_API_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Bearer ${token}`,
      },
      body: new URLSearchParams({
        date: fetchDate,
        sport: sport.toUpperCase(),
        viewType: "game_by_date",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`SportsGrid API error: ${response.status} ${response.statusText}`);
    }

    this.requestCount++;
    this.rateLimitRemaining = Math.max(0, RATE_LIMIT_TOTAL - this.requestCount);

    const data = await response.json();

    // Games are in data.games array for the authenticated API
    return data?.data?.games || [];
  }

  /**
   * Parse a SportsGrid game into odds data.
   */
  private parseGameToOdds(game: SportsGridGame, _sport: Sport): RawOddsData | null {
    if (!game.home_full_name || !game.away_full_name) {
      return null;
    }

    // Parse spread from home_spread_point (e.g., "+4.5" or "-3.5")
    const spread = this.parseNumber(game.home_spread_point);

    // Parse moneylines (e.g., "-155" or "+125")
    const homeMoneyline = this.parseNumber(game.home_ml_point);
    const awayMoneyline = this.parseNumber(game.away_ml_point);

    // Parse over/under from home_total_point (e.g., "U 235.5" -> 235.5)
    const overUnder = this.parseOverUnder(game.home_total_point);

    // Parse game date
    let gameDate = new Date();
    if (game.scheduled) {
      const parsed = new Date(game.scheduled);
      if (!isNaN(parsed.getTime())) {
        gameDate = parsed;
      }
    }

    return {
      externalGameId: game.key || undefined,
      homeTeam: game.home_full_name,
      awayTeam: game.away_full_name,
      gameDate,
      homeMoneyline,
      awayMoneyline,
      spread,
      spreadJuice: -110, // Standard juice if not provided
      overUnder,
      overJuice: -110, // Standard juice if not provided
      underJuice: -110, // Standard juice if not provided
      rawData: {
        ...game,
        homeLogo: game.home_logo,
        awayLogo: game.away_logo,
      },
    };
  }

  /**
   * Parse a SportsGrid game into result data (for completed games).
   */
  private parseGameToResult(game: SportsGridGame): RawGameResult | null {
    if (!game.home_full_name || !game.away_full_name) {
      return null;
    }

    // Only process final games
    if (!game.final) {
      return null;
    }

    // Parse game date
    let gameDate = new Date();
    if (game.scheduled) {
      const parsed = new Date(game.scheduled);
      if (!isNaN(parsed.getTime())) {
        gameDate = parsed;
      }
    }

    // Determine game status
    let status = "FINAL";
    if (game.postponed) {
      status = "POSTPONED";
    } else if (game.delayed) {
      status = "DELAYED";
    }

    // Calculate spread winner
    const spreadWinner = this.calculateSpreadWinner(
      game.home_score,
      game.away_score,
      game.home_spread_point
    );

    // Calculate total result
    const totalResult = this.calculateTotalResult(
      game.home_score,
      game.away_score,
      game.home_total_point
    );

    return {
      externalGameId: game.key || undefined,
      homeTeam: game.home_full_name,
      awayTeam: game.away_full_name,
      gameDate,
      homeScore: game.home_score,
      awayScore: game.away_score,
      status,
      spreadWinner,
      totalResult,
      statsJson: {
        winTeam: game.win_team,
        headerDescription: game.header_description,
        playoffDescription: game.playoff_description,
        duration: game.duration,
        spread: game.home_spread_point,
        overUnder: game.home_total_point,
        homeMoneyline: game.home_ml_point,
        awayMoneyline: game.away_ml_point,
        homeLogo: game.home_logo,
        awayLogo: game.away_logo,
        homeColor: game.home_primary_color,
        awayColor: game.away_primary_color,
      },
      rawData: game,
    };
  }

  /**
   * Calculate who covered the spread.
   * Home spread is from home team's perspective (e.g., "+6.5" means home is underdog).
   */
  private calculateSpreadWinner(
    homeScore: number | undefined,
    awayScore: number | undefined,
    homeSpreadPoint: string | undefined
  ): "HOME" | "AWAY" | "PUSH" | undefined {
    if (homeScore === undefined || awayScore === undefined || !homeSpreadPoint) {
      return undefined;
    }

    const spread = this.parseNumber(homeSpreadPoint);
    if (spread === undefined) {
      return undefined;
    }

    // Home team's adjusted score = homeScore + spread
    // If home + spread > away, home covers
    const homeAdjusted = homeScore + spread;

    if (homeAdjusted > awayScore) {
      return "HOME";
    } else if (homeAdjusted < awayScore) {
      return "AWAY";
    } else {
      return "PUSH";
    }
  }

  /**
   * Calculate over/under result.
   * Total point is in format "U 232.5" or "O 232.5".
   */
  private calculateTotalResult(
    homeScore: number | undefined,
    awayScore: number | undefined,
    totalPoint: string | undefined
  ): "OVER" | "UNDER" | "PUSH" | undefined {
    if (homeScore === undefined || awayScore === undefined || !totalPoint) {
      return undefined;
    }

    const total = this.parseOverUnder(totalPoint);
    if (total === undefined) {
      return undefined;
    }

    const actualTotal = homeScore + awayScore;

    if (actualTotal > total) {
      return "OVER";
    } else if (actualTotal < total) {
      return "UNDER";
    } else {
      return "PUSH";
    }
  }

  /**
   * Parse a number from a string like "+4.5", "-3.5", "-155", etc.
   */
  private parseNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const match = value.match(/([+-]?\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }

  /**
   * Parse over/under from a string like "U 235.5" or "O 220.5"
   */
  private parseOverUnder(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const match = value.match(/(\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }

  /**
   * Get yesterday's date in YYYY-MM-DD format.
   */
  private getYesterdayDate(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  /**
   * Convert odds data to a news item.
   */
  private oddsToNewsItem(odds: RawOddsData, _sport: Sport): RawNewsItem {
    const parts: string[] = [];

    if (odds.spread !== undefined) {
      const favorite = odds.spread < 0 ? odds.homeTeam : odds.awayTeam;
      parts.push(`${favorite} ${odds.spread > 0 ? "+" : ""}${odds.spread}`);
    }

    if (odds.overUnder !== undefined) {
      parts.push(`O/U ${odds.overUnder}`);
    }

    if (odds.homeMoneyline !== undefined && odds.awayMoneyline !== undefined) {
      parts.push(
        `ML: ${odds.awayTeam} ${odds.awayMoneyline > 0 ? "+" : ""}${odds.awayMoneyline} / ${odds.homeTeam} ${odds.homeMoneyline > 0 ? "+" : ""}${odds.homeMoneyline}`
      );
    }

    const headline = `${odds.awayTeam} @ ${odds.homeTeam} - ${parts.join(" | ") || "Lines TBD"}`;

    return {
      externalId: `sg-${odds.externalGameId || this.hashString(`${odds.homeTeam}-${odds.awayTeam}-${odds.gameDate.toISOString()}`)}`,
      type: "BETTING_LINE" as NewsItemType,
      headline,
      content: `Game: ${odds.awayTeam} at ${odds.homeTeam}\nDate: ${odds.gameDate.toLocaleDateString()}\nSpread: ${odds.spread ?? "N/A"}\nOver/Under: ${odds.overUnder ?? "N/A"}`,
      url: undefined,
      imageUrl: undefined,
      publishedAt: new Date(),
      author: "SportsGrid",
      rawData: odds.rawData,
    };
  }

  /**
   * Wait for rate limit if necessary.
   */
  private async waitForRateLimit(): Promise<void> {
    // Check window reset
    const now = Date.now();
    if (now - this.windowStart >= RATE_LIMIT_WINDOW_MS) {
      this.windowStart = now;
      this.requestCount = 0;
      this.rateLimitRemaining = RATE_LIMIT_TOTAL;
    }

    // Check per-request interval
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();

    // Check if rate limited
    if (this.requestCount >= RATE_LIMIT_TOTAL) {
      this.rateLimitReset = new Date(this.windowStart + RATE_LIMIT_WINDOW_MS);
      const waitTime = this.rateLimitReset.getTime() - Date.now();
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.windowStart = Date.now();
        this.requestCount = 0;
        this.rateLimitRemaining = RATE_LIMIT_TOTAL;
      }
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

// Types for SportsGrid API responses (authenticated API)
interface SportsGridGame {
  key?: string;
  sport?: string;
  home_full_name?: string;
  away_full_name?: string;
  home_name?: string; // abbreviation
  away_name?: string; // abbreviation
  scheduled?: string;
  home_spread_point?: string; // e.g., "-3.5"
  away_spread_point?: string; // e.g., "+3.5"
  home_ml_point?: string; // e.g., "-155"
  away_ml_point?: string; // e.g., "+125"
  home_total_point?: string; // e.g., "U 235.5"
  away_total_point?: string; // e.g., "O 235.5"
  home_logo?: string;
  away_logo?: string;
  home_primary_color?: string;
  away_primary_color?: string;
  // For final games, these are scores (numbers)
  home_score?: number;
  away_score?: number;
  // Game status flags
  final?: boolean;
  live?: boolean;
  postponed?: boolean;
  delayed?: boolean;
  win_team?: string; // "home" or "away"
  duration?: string; // e.g., "End of 4th"
  header_description?: string; // e.g., "Wizards covered +6.5, U 232.5"
  playoff_description?: string; // e.g., "S. Sharpe 37 PRA, A. Sarr 44 PRA"
}

// Export singleton instance
export const sportsGridAdapter = new SportsGridAdapter();
