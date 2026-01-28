import type { Source, Sport } from "@prisma/client";
import type {
  FetchOptions,
  FetchResult,
  ValidationResult,
  RawNewsItem,
  RawOddsData,
  NewsItemType,
} from "./types";
import { BaseAdapter, type OddsAdapter } from "./base-adapter";

// SportsGrid API endpoint
const SPORTSGRID_API_URL = "https://web.sportsgrid.com/api/web/v1/getSingleSportGamesData";

// Sport to SportsGrid sport name mapping (lowercase)
const SPORT_MAP: Record<Sport, string> = {
  NFL: "nfl",
  NBA: "nba",
  MLB: "mlb",
  NHL: "nhl",
  SOCCER: "soccer",
  BOXING: "boxing",
  SPORTS_BETTING: "nfl", // Default to NFL
};

// Self-imposed rate limiting: 10 requests per minute, 6s between requests
const MIN_REQUEST_INTERVAL_MS = 6000;
const RATE_LIMIT_TOTAL = 10;
const RATE_LIMIT_WINDOW_MS = 60000;

/**
 * SportsGrid config stored in Source.config JSON field.
 */
export interface SportsGridConfig {
  sport?: string; // Optional sport override (lowercase)
}

/**
 * SportsGrid Adapter
 * Fetches betting odds from SportsGrid's public API.
 */
export class SportsGridAdapter extends BaseAdapter implements OddsAdapter {
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

  async fetchOdds(source: Source, options?: FetchOptions): Promise<RawOddsData[]> {
    const config = this.parseConfig<SportsGridConfig>(source);

    // Get sport name for API (use config override or map from source.sport)
    const sportName = config.sport || SPORT_MAP[source.sport] || "nfl";

    // Respect rate limiting
    await this.waitForRateLimit();

    try {
      const games = await this.fetchGames(sportName);

      const odds: RawOddsData[] = [];

      for (const game of games) {
        // Respect limit
        if (options?.limit && odds.length >= options.limit) {
          break;
        }

        const oddData = this.parseGame(game);
        if (oddData) {
          odds.push(oddData);
        }
      }

      return odds;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch SportsGrid odds: ${errorMessage}`);
    }
  }

  validateConfig(config: unknown): ValidationResult {
    if (!config || typeof config !== "object") {
      return this.validationError(["Configuration must be an object"]);
    }

    const cfg = config as Record<string, unknown>;
    const warnings: string[] = [];

    // Optional: sport override
    if (cfg.sport !== undefined && typeof cfg.sport !== "string") {
      return this.validationError(["sport must be a string if provided (e.g., 'nfl', 'nba', 'mlb')"]);
    }

    // Add info about rate limiting
    warnings.push("SportsGrid API has self-imposed rate limiting. Recommended refresh interval: 10+ minutes.");

    return this.validationSuccess(warnings);
  }

  async testConnection(config: SportsGridConfig): Promise<boolean> {
    try {
      const sport = config.sport || "nfl";
      const games = await this.fetchGames(sport);
      return Array.isArray(games);
    } catch {
      return false;
    }
  }

  /**
   * Fetch games from SportsGrid API.
   */
  private async fetchGames(sport: string): Promise<SportsGridGame[]> {
    const response = await fetch(SPORTSGRID_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": process.env.SCRAPER_USER_AGENT || "ClipScout/1.0",
      },
      body: JSON.stringify({ sport: sport.toLowerCase() }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`SportsGrid API error: ${response.status} ${response.statusText}`);
    }

    this.requestCount++;
    this.rateLimitRemaining = Math.max(0, RATE_LIMIT_TOTAL - this.requestCount);

    const data = await response.json();

    // Games are in data.featured_games.data array (or featured_games.data)
    return data?.data?.featured_games?.data || data?.featured_games?.data || [];
  }

  /**
   * Parse a SportsGrid game into odds data.
   *
   * Field mapping:
   * - home_name -> homeTeam
   * - away_name -> awayTeam
   * - scheduled_raw -> gameDate
   * - key -> externalGameId
   * - home_spread_point ("+4.5") -> spread (4.5)
   * - home_ml_point ("+203") -> homeMoneyline (203)
   * - away_ml_point ("-213") -> awayMoneyline (-213)
   * - home_total_point ("U 45.5") -> overUnder (45.5)
   */
  private parseGame(game: SportsGridGame): RawOddsData | null {
    if (!game.home_name || !game.away_name) {
      return null;
    }

    // Parse spread from home_spread_point (e.g., "+4.5" or "-3.5")
    let spread: number | undefined;
    if (game.home_spread_point) {
      const spreadMatch = game.home_spread_point.match(/([+-]?\d+\.?\d*)/);
      if (spreadMatch) {
        spread = parseFloat(spreadMatch[1]);
      }
    }

    // Parse home moneyline from home_ml_point (e.g., "+203" or "-150")
    let homeMoneyline: number | undefined;
    if (game.home_ml_point) {
      const mlMatch = game.home_ml_point.match(/([+-]?\d+)/);
      if (mlMatch) {
        homeMoneyline = parseInt(mlMatch[1], 10);
      }
    }

    // Parse away moneyline from away_ml_point (e.g., "-213" or "+180")
    let awayMoneyline: number | undefined;
    if (game.away_ml_point) {
      const mlMatch = game.away_ml_point.match(/([+-]?\d+)/);
      if (mlMatch) {
        awayMoneyline = parseInt(mlMatch[1], 10);
      }
    }

    // Parse over/under from home_total_point (e.g., "U 45.5" or "O 220.5")
    // The total is the same for both over and under, just extract the number
    let overUnder: number | undefined;
    if (game.home_total_point) {
      const ouMatch = game.home_total_point.match(/(\d+\.?\d*)/);
      if (ouMatch) {
        overUnder = parseFloat(ouMatch[1]);
      }
    }

    // Parse game date
    let gameDate = new Date();
    if (game.scheduled_raw) {
      const parsed = new Date(game.scheduled_raw);
      if (!isNaN(parsed.getTime())) {
        gameDate = parsed;
      }
    }

    return {
      externalGameId: game.key || undefined,
      homeTeam: game.home_name,
      awayTeam: game.away_name,
      gameDate,
      homeMoneyline,
      awayMoneyline,
      spread,
      spreadJuice: -110, // Standard juice if not provided
      overUnder,
      overJuice: -110, // Standard juice if not provided
      underJuice: -110, // Standard juice if not provided
      rawData: game,
    };
  }

  /**
   * Convert odds data to a news item.
   */
  private oddsToNewsItem(odds: RawOddsData, sport: Sport): RawNewsItem {
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

// Types for SportsGrid API responses
interface SportsGridGame {
  key?: string;
  home_name?: string;
  away_name?: string;
  scheduled_raw?: string;
  home_spread_point?: string; // e.g., "+4.5"
  away_spread_point?: string; // e.g., "-4.5"
  home_ml_point?: string; // e.g., "+203"
  away_ml_point?: string; // e.g., "-213"
  home_total_point?: string; // e.g., "U 45.5"
  away_total_point?: string; // e.g., "O 45.5"
}

// Export singleton instance
export const sportsGridAdapter = new SportsGridAdapter();
