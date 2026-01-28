import type { Source, Sport } from "@prisma/client";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
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

// Add stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

// DraftKings Sportsbook URLs
const DK_BASE_URL = "https://sportsbook.draftkings.com";

// Sport to DraftKings URL path mapping
const SPORT_PATHS: Record<Sport, string> = {
  NFL: "/leagues/football/nfl",
  NBA: "/leagues/basketball/nba",
  MLB: "/leagues/baseball/mlb",
  NHL: "/leagues/hockey/nhl",
  SOCCER: "/leagues/soccer",
  BOXING: "/leagues/mma/ufc",
  SPORTS_BETTING: "/leagues/football/nfl",
};

// Team lists for DOM scraping fallback
const NFL_TEAMS = [
  "Chiefs", "Eagles", "Bills", "Ravens", "Lions", "Cowboys", "Packers", "Rams",
  "49ers", "Vikings", "Dolphins", "Chargers", "Texans", "Steelers", "Broncos", "Bengals",
  "Seahawks", "Buccaneers", "Saints", "Bears", "Commanders", "Jets", "Giants", "Raiders",
  "Falcons", "Cardinals", "Colts", "Jaguars", "Patriots", "Titans", "Browns", "Panthers"
];

const NBA_TEAMS = [
  "Lakers", "Celtics", "Warriors", "Nuggets", "Heat", "Bucks", "Suns", "Clippers",
  "Mavericks", "Nets", "Knicks", "76ers", "Bulls", "Hawks", "Kings", "Cavaliers",
  "Timberwolves", "Thunder", "Pelicans", "Grizzlies", "Jazz", "Blazers", "Pacers",
  "Magic", "Raptors", "Hornets", "Wizards", "Rockets", "Pistons", "Spurs"
];

// Self-imposed rate limiting
const MIN_REQUEST_INTERVAL_MS = 15000;
const RATE_LIMIT_TOTAL = 4;
const RATE_LIMIT_WINDOW_MS = 60000;

/**
 * DraftKings Scraper Adapter
 * Scrapes betting odds from DraftKings sportsbook using Puppeteer with stealth.
 */
export class DraftKingsScraperAdapter extends BaseAdapter implements OddsAdapter {
  readonly type = "DRAFTKINGS_SCRAPE" as const;
  readonly name = "DraftKings Scraper";

  private browser: Browser | null = null;
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
    const sportPath = SPORT_PATHS[source.sport] || SPORT_PATHS.NFL;

    await this.waitForRateLimit();

    let page: Page | null = null;

    try {
      if (!this.browser) {
        console.log(`[DraftKings Scraper] Launching browser...`);
        this.browser = await puppeteer.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--window-size=1920,1080",
            "--start-maximized",
          ],
          ignoreDefaultArgs: ["--enable-automation"],
        });
      }

      page = await this.browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        process.env.SCRAPER_USER_AGENT ||
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Override automation detection fingerprints
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
        (window as any).chrome = { runtime: {} };
      });

      // Block heavy resources for faster loading
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const resourceType = req.resourceType();
        if (["image", "font", "media"].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      const url = `${DK_BASE_URL}${sportPath}`;
      console.log(`[DraftKings Scraper] Navigating to ${url}`);

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // Wait for JavaScript to render
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Try to wait for game elements
      try {
        await page.waitForSelector('[class*="event"], [class*="sportsbook-event"], [class*="game"]', {
          timeout: 15000,
        });
        console.log(`[DraftKings Scraper] Found game elements on page`);
      } catch {
        console.log(`[DraftKings Scraper] No game elements found, continuing...`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check for bot detection
      const pageTitle = await page.title();
      if (
        pageTitle.includes("Access Denied") ||
        pageTitle.includes("captcha") ||
        pageTitle.includes("blocked")
      ) {
        console.log(`[DraftKings Scraper] Blocked by anti-bot protection`);
        return [];
      }

      // Get the full rendered HTML
      const html = await page.content();
      console.log(`[DraftKings Scraper] Page size: ${html.length} bytes`);

      // Check for captcha
      if (html.includes("px-captcha") || html.includes("Please verify you are a human")) {
        console.log(`[DraftKings Scraper] Blocked by captcha`);
        return [];
      }

      // Try to extract __INITIAL_STATE__
      const state = this.extractInitialState(html);
      let odds: RawOddsData[] = [];

      if (state) {
        console.log(`[DraftKings Scraper] Extracted initial state`);
        odds = this.parseGamesFromState(state, source.sport);
      }

      // If no odds from state, try DOM scraping
      if (odds.length === 0) {
        console.log(`[DraftKings Scraper] Falling back to DOM scraping`);

        // Try to get state from window object
        const windowState = await page.evaluate(() => (window as any).__INITIAL_STATE__ || null);
        if (windowState) {
          odds = this.parseGamesFromState(windowState, source.sport);
        }

        // If still no data, scrape from DOM
        if (odds.length === 0) {
          odds = await this.scrapeGamesFromDOM(page, source.sport);
        }
      }

      // Apply limit
      if (options?.limit && odds.length > options.limit) {
        odds = odds.slice(0, options.limit);
      }

      console.log(`[DraftKings Scraper] Found ${odds.length} games with odds`);
      return odds;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[DraftKings Scraper] Error:`, errorMessage);
      throw new Error(`Failed to scrape DraftKings: ${errorMessage}`);
    } finally {
      if (page) {
        await page.close();
      }
      this.requestCount++;
      this.rateLimitRemaining = Math.max(0, RATE_LIMIT_TOTAL - this.requestCount);
    }
  }

  /**
   * Extract __INITIAL_STATE__ from HTML.
   */
  private extractInitialState(html: string): any {
    try {
      const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
      if (match && match[1]) {
        let jsonStr = match[1];

        // Find the balanced end of the JSON object
        let depth = 0;
        let endIdx = 0;
        for (let i = 0; i < jsonStr.length; i++) {
          if (jsonStr[i] === "{") depth++;
          else if (jsonStr[i] === "}") {
            depth--;
            if (depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }

        if (endIdx > 0) {
          jsonStr = jsonStr.substring(0, endIdx);
        }

        return JSON.parse(jsonStr);
      }
    } catch (error) {
      console.log(`[DraftKings Scraper] Error parsing initial state`);
    }
    return null;
  }

  /**
   * Parse games from DraftKings initial state.
   */
  private parseGamesFromState(state: any, sport: Sport): RawOddsData[] {
    const odds: RawOddsData[] = [];

    try {
      const events = state?.events || {};
      const offers = state?.offers || {};

      // If events is empty, try alternative structures
      if (Object.keys(events).length === 0) {
        for (const [key, value] of Object.entries(state)) {
          if (value && typeof value === "object" && (value as any).events) {
            Object.assign(events, (value as any).events);
          }
          if (value && typeof value === "object" && (value as any).offers) {
            Object.assign(offers, (value as any).offers);
          }
        }
      }

      // Process each event
      for (const [eventId, event] of Object.entries(events)) {
        if (!event || typeof event !== "object") continue;

        const eventData = event as any;
        const name = eventData.name || eventData.eventName || "";
        if (!name || name.length < 3) continue;

        // Parse team names
        let homeTeam = eventData.teamName2 || name.split(/\s+[@vs]+\s+/i)[1]?.trim() || "Unknown";
        let awayTeam = eventData.teamName1 || name.split(/\s+[@vs]+\s+/i)[0]?.trim() || "Unknown";

        let homeMoneyline: number | undefined;
        let awayMoneyline: number | undefined;
        let spread: number | undefined;
        let spreadJuice: number | undefined;
        let overUnder: number | undefined;
        let overJuice: number | undefined;
        let underJuice: number | undefined;

        // Find offers for this event
        for (const [offerId, offer] of Object.entries(offers)) {
          if (!offer || (offer as any).eventId != eventId) continue;

          const offerData = offer as any;
          const label = (offerData.label || offerData.marketName || "").toLowerCase();
          const outcomes = offerData.outcomes || [];

          if (label.includes("moneyline") || label.includes("winner") || offerData.marketTypeId === 1) {
            outcomes.forEach((o: any) => {
              if (o.label && o.oddsAmerican) {
                if (o.label.includes(awayTeam) || outcomes.indexOf(o) === 0) {
                  awayMoneyline = o.oddsAmerican;
                } else {
                  homeMoneyline = o.oddsAmerican;
                }
              }
            });
          } else if (label.includes("spread") || label.includes("handicap") || offerData.marketTypeId === 2) {
            outcomes.forEach((o: any, idx: number) => {
              if (o.line !== undefined && o.oddsAmerican) {
                if (idx === 1) {
                  spread = o.line;
                  spreadJuice = o.oddsAmerican;
                }
              }
            });
          } else if (label.includes("total") || label.includes("over") || offerData.marketTypeId === 3) {
            outcomes.forEach((o: any) => {
              if (o.line !== undefined && o.oddsAmerican) {
                if ((o.label || "").toLowerCase().includes("over")) {
                  overUnder = o.line;
                  overJuice = o.oddsAmerican;
                } else if ((o.label || "").toLowerCase().includes("under")) {
                  underJuice = o.oddsAmerican;
                }
              }
            });
          }
        }

        // Only include if we have meaningful data
        if (name.includes("@") || name.includes(" vs ") || (homeTeam !== "Unknown" && awayTeam !== "Unknown")) {
          odds.push({
            externalGameId: eventId,
            homeTeam,
            awayTeam,
            gameDate: new Date(eventData.startDate || eventData.eventStartDate || Date.now()),
            homeMoneyline,
            awayMoneyline,
            spread,
            spreadJuice,
            overUnder,
            overJuice,
            underJuice,
            rawData: { eventId, name },
          });
        }
      }
    } catch (error) {
      console.log(`[DraftKings Scraper] Error parsing games from state`);
    }

    return odds;
  }

  /**
   * DOM scraping fallback.
   */
  private async scrapeGamesFromDOM(page: Page, sport: Sport): Promise<RawOddsData[]> {
    const teamList = sport === "NBA" ? NBA_TEAMS : NFL_TEAMS;

    const games = await page.evaluate((teams: string[]) => {
      const results: any[] = [];
      const allElements = document.querySelectorAll("*");
      const potentialGameElements: { el: Element; foundTeams: string[]; textLen: number }[] = [];

      allElements.forEach((el) => {
        if (el.children.length > 0) {
          const text = el.textContent || "";
          const foundTeams: string[] = [];
          teams.forEach((team) => {
            if (text.includes(team) && !foundTeams.includes(team)) {
              foundTeams.push(team);
            }
          });

          // If element contains exactly 2 team names and has odds-like numbers
          if (foundTeams.length === 2 && text.length >= 50 && text.length < 2000) {
            if (text.match(/[+-]\d{3}/) || text.match(/\d+\.5/)) {
              potentialGameElements.push({ el, foundTeams, textLen: text.length });
            }
          }
        }
      });

      // Sort by text length to prefer smaller containers
      potentialGameElements.sort((a, b) => a.textLen - b.textLen);

      // Deduplicate by team pair
      const gamesByTeams = new Map<string, { foundTeams: string[]; text: string }>();
      potentialGameElements.forEach(({ el, foundTeams, textLen }) => {
        const teamKey = [...foundTeams].sort().join("|");
        if (!gamesByTeams.has(teamKey) || textLen < (gamesByTeams.get(teamKey) as any).textLen) {
          gamesByTeams.set(teamKey, { foundTeams, text: el.textContent?.trim() || "" });
        }
      });

      gamesByTeams.forEach(({ foundTeams, text }) => {
        const oddsMatches = text.match(/[+-]\d{3}/g) || [];
        const spreadMatches = text.match(/[+-]?\d+\.5/g) || [];
        const totalMatches = text.match(/[OU]\s*\d+\.?\d*/gi) || [];

        if (foundTeams.length >= 2) {
          results.push({
            awayTeam: foundTeams[0],
            homeTeam: foundTeams[1],
            awayMoneyline: oddsMatches[0] ? parseInt(oddsMatches[0]) : undefined,
            homeMoneyline: oddsMatches[1] ? parseInt(oddsMatches[1]) : undefined,
            spread: spreadMatches[0] ? parseFloat(spreadMatches[0]) : undefined,
            overUnder: totalMatches[0] ? parseFloat(totalMatches[0].replace(/[OU]\s*/i, "")) : undefined,
          });
        }
      });

      return results;
    }, teamList);

    return games.map((g) => ({
      externalGameId: `dk-dom-${this.hashString(`${g.awayTeam}-${g.homeTeam}`)}`,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      gameDate: new Date(),
      homeMoneyline: g.homeMoneyline,
      awayMoneyline: g.awayMoneyline,
      spread: g.spread,
      overUnder: g.overUnder,
      rawData: { source: "dom_scrape" },
    }));
  }

  validateConfig(config: unknown): ValidationResult {
    if (!config || typeof config !== "object") {
      return this.validationError(["Configuration must be an object"]);
    }

    const cfg = config as Record<string, unknown>;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!cfg.sport || typeof cfg.sport !== "string") {
      errors.push("sport is required (e.g., 'nfl', 'nba', 'mlb')");
    }

    if (errors.length > 0) {
      return this.validationError(errors);
    }

    warnings.push("DraftKings scraping has strict rate limiting. Fetch interval should be at least 15 seconds.");

    return this.validationSuccess(warnings);
  }

  async testConnection(config: DraftKingsConfig): Promise<boolean> {
    try {
      if (!this.browser) {
        this.browser = await puppeteer.launch({ headless: true });
      }
      const page = await this.browser.newPage();
      const sportPath = SPORT_PATHS[config.sport.toUpperCase() as Sport] || SPORT_PATHS.NFL;
      await page.goto(`${DK_BASE_URL}${sportPath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const content = await page.content();
      await page.close();
      return content.includes("draftkings") || content.includes("sportsbook");
    } catch {
      return false;
    }
  }

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
      externalId: odds.externalGameId || `dk-${this.hashString(`${odds.homeTeam}-${odds.awayTeam}`)}`,
      type: "BETTING_LINE" as NewsItemType,
      headline,
      content: `Game: ${odds.awayTeam} at ${odds.homeTeam}\nSpread: ${odds.spread ?? "N/A"}\nOver/Under: ${odds.overUnder ?? "N/A"}`,
      publishedAt: new Date(),
      author: "DraftKings Sportsbook",
      rawData: odds.rawData,
    };
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart >= RATE_LIMIT_WINDOW_MS) {
      this.windowStart = now;
      this.requestCount = 0;
      this.rateLimitRemaining = RATE_LIMIT_TOTAL;
    }

    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
      console.log(`[DraftKings Scraper] Rate limiting: waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();

    if (this.requestCount >= RATE_LIMIT_TOTAL) {
      this.rateLimitReset = new Date(this.windowStart + RATE_LIMIT_WINDOW_MS);
      const waitTime = this.rateLimitReset.getTime() - Date.now();
      if (waitTime > 0) {
        console.log(`[DraftKings Scraper] Rate limited: waiting ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.windowStart = Date.now();
        this.requestCount = 0;
        this.rateLimitRemaining = RATE_LIMIT_TOTAL;
      }
    }
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const draftKingsScraperAdapter = new DraftKingsScraperAdapter();
