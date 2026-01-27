import type { Source, Sport } from "@prisma/client";
import type {
  FetchOptions,
  FetchResult,
  ValidationResult,
  RawNewsItem,
  RawOddsData,
  DraftKingsConfig,
  NewsItemType,
} from "./types";
import { BaseAdapter, type OddsAdapter } from "./base-adapter";

// DraftKings Sportsbook API (public endpoints)
const DK_API_BASE = "https://sportsbook.draftkings.com/api/odds/v1";
const DK_GATEWAY_BASE = "https://sportsbook-nash-usva.draftkings.com/api/sportscontent/dkusva/v1";

// Sport to DraftKings sport/league mapping
const SPORT_MAP: Record<Sport, { sportId: number; leagueId?: number; name: string }> = {
  NFL: { sportId: 1, leagueId: 88808, name: "NFL" },
  NBA: { sportId: 3, leagueId: 42648, name: "NBA" },
  MLB: { sportId: 2, leagueId: 84240, name: "MLB" },
  NHL: { sportId: 4, leagueId: 42133, name: "NHL" },
  SOCCER: { sportId: 5, name: "Soccer" },
  BOXING: { sportId: 15, name: "Boxing" },
  SPORTS_BETTING: { sportId: 1, name: "NFL" }, // Default to NFL
};

// Self-imposed rate limiting: 1 request per 10 seconds
const MIN_REQUEST_INTERVAL_MS = 10000;
const RATE_LIMIT_TOTAL = 6; // Per minute
const RATE_LIMIT_WINDOW_MS = 60000;

/**
 * DraftKings Adapter
 * Fetches betting odds from DraftKings sportsbook.
 */
export class DraftKingsAdapter extends BaseAdapter implements OddsAdapter {
  readonly type = "DRAFTKINGS_API" as const;
  readonly name = "DraftKings";

  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor() {
    super();
    this.rateLimitTotal = RATE_LIMIT_TOTAL;
    this.rateLimitRemaining = RATE_LIMIT_TOTAL;
  }

  async fetch(source: Source, options?: FetchOptions): Promise<FetchResult> {
    // DraftKings adapter primarily fetches odds, but we can convert them to news items
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
    const config = this.parseConfig<DraftKingsConfig>(source);

    // Get sport mapping
    const sportMapping = SPORT_MAP[source.sport] || SPORT_MAP.NFL;

    // Respect rate limiting
    await this.waitForRateLimit();

    try {
      // Fetch events for the sport
      const events = await this.fetchEvents(sportMapping.sportId, sportMapping.leagueId);

      const odds: RawOddsData[] = [];

      for (const event of events) {
        // Respect limit
        if (options?.limit && odds.length >= options.limit) {
          break;
        }

        const oddData = this.parseEvent(event);
        if (oddData) {
          odds.push(oddData);
        }
      }

      return odds;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch DraftKings odds: ${errorMessage}`);
    }
  }

  validateConfig(config: unknown): ValidationResult {
    if (!config || typeof config !== "object") {
      return this.validationError(["Configuration must be an object"]);
    }

    const cfg = config as Record<string, unknown>;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required: sport
    if (!cfg.sport || typeof cfg.sport !== "string") {
      errors.push("sport is required (e.g., 'nfl', 'nba', 'mlb')");
    }

    // Optional: league
    if (cfg.league && typeof cfg.league !== "string") {
      errors.push("league must be a string if provided");
    }

    // Optional: eventGroup
    if (cfg.eventGroup && typeof cfg.eventGroup !== "string") {
      errors.push("eventGroup must be a string if provided");
    }

    if (errors.length > 0) {
      return this.validationError(errors);
    }

    // Add warning about rate limiting
    warnings.push("DraftKings has strict rate limiting. Fetch interval should be at least 10 seconds.");

    return this.validationSuccess(warnings);
  }

  async testConnection(config: DraftKingsConfig): Promise<boolean> {
    try {
      const sport = config.sport.toUpperCase() as Sport;
      const sportMapping = SPORT_MAP[sport] || SPORT_MAP.NFL;
      const events = await this.fetchEvents(sportMapping.sportId, sportMapping.leagueId);
      return events.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Fetch events from DraftKings.
   */
  private async fetchEvents(sportId: number, leagueId?: number): Promise<DKEvent[]> {
    // Build URL based on whether we have a league ID
    let url: string;
    if (leagueId) {
      url = `${DK_GATEWAY_BASE}/leagues/${leagueId}/events`;
    } else {
      url = `${DK_GATEWAY_BASE}/sports/${sportId}/events`;
    }

    const response = await this.fetchApi(url);
    const data = await response.json();

    return data.events || [];
  }

  /**
   * Parse a DraftKings event into odds data.
   */
  private parseEvent(event: DKEvent): RawOddsData | null {
    if (!event.eventId || !event.name) {
      return null;
    }

    // Parse team names from event name (usually "Away @ Home" or "Away vs Home")
    const teamMatch = event.name.match(/(.+?)\s*(?:@|vs\.?|v)\s*(.+)/i);
    let awayTeam = "Unknown";
    let homeTeam = "Unknown";

    if (teamMatch) {
      awayTeam = teamMatch[1].trim();
      homeTeam = teamMatch[2].trim();
    } else if (event.teams && event.teams.length >= 2) {
      awayTeam = event.teams[0]?.name || "Unknown";
      homeTeam = event.teams[1]?.name || "Unknown";
    }

    // Extract odds from offer categories
    let homeMoneyline: number | undefined;
    let awayMoneyline: number | undefined;
    let spread: number | undefined;
    let spreadJuice: number | undefined;
    let overUnder: number | undefined;
    let overJuice: number | undefined;
    let underJuice: number | undefined;

    if (event.offers) {
      for (const offer of event.offers) {
        switch (offer.label?.toLowerCase()) {
          case "moneyline":
            if (offer.outcomes && offer.outcomes.length >= 2) {
              // Assuming first is away, second is home
              awayMoneyline = offer.outcomes[0]?.oddsAmerican;
              homeMoneyline = offer.outcomes[1]?.oddsAmerican;
            }
            break;
          case "spread":
          case "point spread":
            if (offer.outcomes && offer.outcomes.length >= 2) {
              spread = offer.outcomes[1]?.line; // Home team spread
              spreadJuice = offer.outcomes[1]?.oddsAmerican;
            }
            break;
          case "total":
          case "over/under":
            if (offer.outcomes && offer.outcomes.length >= 2) {
              overUnder = offer.outcomes[0]?.line;
              overJuice = offer.outcomes[0]?.oddsAmerican;
              underJuice = offer.outcomes[1]?.oddsAmerican;
            }
            break;
        }
      }
    }

    return {
      externalGameId: event.eventId,
      homeTeam,
      awayTeam,
      gameDate: new Date(event.startDate || Date.now()),
      homeMoneyline,
      awayMoneyline,
      spread,
      spreadJuice,
      overUnder,
      overJuice,
      underJuice,
      rawData: event,
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
      externalId: `dk-${odds.externalGameId || this.hashString(`${odds.homeTeam}-${odds.awayTeam}-${odds.gameDate.toISOString()}`)}`,
      type: "BETTING_LINE" as NewsItemType,
      headline,
      content: `Game: ${odds.awayTeam} at ${odds.homeTeam}\nDate: ${odds.gameDate.toLocaleDateString()}\nSpread: ${odds.spread ?? "N/A"}\nOver/Under: ${odds.overUnder ?? "N/A"}`,
      url: undefined,
      imageUrl: undefined,
      publishedAt: new Date(),
      author: "DraftKings Sportsbook",
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
   * Fetch from DraftKings API.
   */
  private async fetchApi(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.SCRAPER_USER_AGENT || "ClipScout/1.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`DraftKings API error: ${response.status} ${response.statusText}`);
    }

    this.requestCount++;
    this.rateLimitRemaining = Math.max(0, RATE_LIMIT_TOTAL - this.requestCount);

    return response;
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

// Types for DraftKings API responses
interface DKEvent {
  eventId: string;
  name: string;
  startDate?: string;
  teams?: Array<{ name?: string }>;
  offers?: DKOffer[];
}

interface DKOffer {
  label?: string;
  outcomes?: DKOutcome[];
}

interface DKOutcome {
  label?: string;
  oddsAmerican?: number;
  line?: number;
}

// Export singleton instance
export const draftKingsAdapter = new DraftKingsAdapter();
