import type { Source } from "@prisma/client";
import * as cheerio from "cheerio";
import type {
  FetchOptions,
  FetchResult,
  ValidationResult,
  RawNewsItem,
  WebsiteScraperConfig,
  NewsItemType,
} from "./types";
import { BaseAdapter } from "./base-adapter";

// Self-imposed rate limiting for scraping
const MIN_REQUEST_INTERVAL_MS = 5000; // 5 seconds between requests

/**
 * Website Scraper Adapter
 * Scrapes news items from websites using Cheerio for HTML parsing.
 */
export class ScraperAdapter extends BaseAdapter {
  readonly type = "WEBSITE_SCRAPE" as const;
  readonly name = "Website Scraper";

  private lastRequestTime: number = 0;

  constructor() {
    super();
    // Self-imposed rate limit: 12 requests per minute
    this.rateLimitTotal = 12;
    this.rateLimitRemaining = 12;
  }

  async fetch(source: Source, options?: FetchOptions): Promise<FetchResult> {
    const config = this.parseConfig<WebsiteScraperConfig>(source);
    const items: RawNewsItem[] = [];

    try {
      // Respect rate limiting
      await this.waitForRateLimit();

      // Fetch the page
      const html = await this.fetchPage(config.url);
      const $ = cheerio.load(html);

      // Find all news items using container selector or body
      const container = config.selectors.container ? $(config.selectors.container) : $("body");

      // Find items within container
      const itemElements = container.find(config.selectors.headline).closest("article, div, li");

      // If no container structure, just find headlines directly
      const elementsToProcess =
        itemElements.length > 0
          ? itemElements
          : container.find(config.selectors.headline).parent();

      elementsToProcess.each((index, element) => {
        // Respect limits
        if (options?.limit && items.length >= options.limit) {
          return false; // Break out of .each()
        }
        if (config.maxItems && items.length >= config.maxItems) {
          return false;
        }

        const rawItem = this.parseElement($, element, config, source.sport);
        if (rawItem) {
          // Skip items older than 'since' date if specified
          if (options?.since && rawItem.publishedAt < options.since) {
            return; // Continue to next
          }
          items.push(rawItem);
        }
      });

      // Update rate limit tracking
      this.rateLimitRemaining--;
      if (this.rateLimitRemaining <= 0) {
        this.rateLimitReset = new Date(Date.now() + 60000); // Reset in 1 minute
      }

      return {
        items,
        hasMore: config.pagination?.nextSelector ? $(config.pagination.nextSelector).length > 0 : false,
        rateLimitRemaining: this.rateLimitRemaining,
        rateLimitReset: this.rateLimitReset,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to scrape website: ${errorMessage}`);
    }
  }

  validateConfig(config: unknown): ValidationResult {
    if (!config || typeof config !== "object") {
      return this.validationError(["Configuration must be an object"]);
    }

    const cfg = config as Record<string, unknown>;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required: url
    if (!cfg.url || typeof cfg.url !== "string") {
      errors.push("url is required and must be a string");
    } else {
      try {
        new URL(cfg.url);
      } catch {
        errors.push("url must be a valid URL");
      }
    }

    // Required: selectors object
    if (!cfg.selectors || typeof cfg.selectors !== "object") {
      errors.push("selectors object is required");
    } else {
      const selectors = cfg.selectors as Record<string, unknown>;

      // Required: headline selector
      if (!selectors.headline || typeof selectors.headline !== "string") {
        errors.push("selectors.headline is required and must be a CSS selector string");
      }

      // Optional but recommended
      if (!selectors.content) {
        warnings.push("selectors.content not specified - only headlines will be captured");
      }
      if (!selectors.date) {
        warnings.push("selectors.date not specified - current time will be used");
      }
    }

    // Optional: maxItems
    if (cfg.maxItems !== undefined) {
      if (typeof cfg.maxItems !== "number" || cfg.maxItems < 1) {
        errors.push("maxItems must be a positive number");
      }
    }

    if (errors.length > 0) {
      return this.validationError(errors);
    }

    return this.validationSuccess(warnings);
  }

  async testConnection(config: WebsiteScraperConfig): Promise<boolean> {
    try {
      const html = await this.fetchPage(config.url);
      const $ = cheerio.load(html);
      const headlines = $(config.selectors.headline);
      return headlines.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Fetch a page with proper headers and timeout.
   */
  private async fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": process.env.SCRAPER_USER_AGENT || "ClipScout/1.0 (News Aggregator)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Wait for rate limit if necessary.
   */
  private async waitForRateLimit(): Promise<void> {
    // Ensure minimum time between requests
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();

    // Also check if we're rate limited
    if (this.shouldWaitForRateLimit()) {
      const waitTime = this.getWaitTime();
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.rateLimitRemaining = this.rateLimitTotal;
      }
    }
  }

  /**
   * Parse a single HTML element into a RawNewsItem.
   */
  private parseElement(
    $: cheerio.CheerioAPI,
    element: Parameters<cheerio.CheerioAPI>[0],
    config: WebsiteScraperConfig,
    sport: Source["sport"]
  ): RawNewsItem | null {
    const $el = $(element);

    // Get headline (required)
    const headlineEl = $el.find(config.selectors.headline).first();
    const headline = headlineEl.text().trim();
    if (!headline) {
      return null;
    }

    // Get content (optional)
    const content = config.selectors.content
      ? $el.find(config.selectors.content).first().text().trim()
      : undefined;

    // Get URL (optional)
    let url: string | undefined;
    if (config.selectors.link) {
      url = $el.find(config.selectors.link).first().attr("href");
    } else {
      // Try to find URL from headline link
      url = headlineEl.attr("href") || headlineEl.find("a").first().attr("href");
    }

    // Resolve relative URLs
    if (url && !url.startsWith("http")) {
      try {
        url = new URL(url, config.url).href;
      } catch {
        // Invalid URL, leave as-is
      }
    }

    // Get date (optional)
    let publishedAt = new Date();
    if (config.selectors.date) {
      const dateStr = $el.find(config.selectors.date).first().text().trim();
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          publishedAt = parsed;
        }
      }
    }

    // Get author (optional)
    const author = config.selectors.author
      ? $el.find(config.selectors.author).first().text().trim()
      : undefined;

    // Get image (optional)
    let imageUrl: string | undefined;
    if (config.selectors.image) {
      imageUrl =
        $el.find(config.selectors.image).first().attr("src") ||
        $el.find(config.selectors.image).first().attr("data-src");
    } else {
      // Try to find any image in the element
      imageUrl = $el.find("img").first().attr("src") || $el.find("img").first().attr("data-src");
    }

    // Resolve relative image URLs
    if (imageUrl && !imageUrl.startsWith("http")) {
      try {
        imageUrl = new URL(imageUrl, config.url).href;
      } catch {
        // Invalid URL, leave as undefined
        imageUrl = undefined;
      }
    }

    // Generate external ID
    const externalId = this.hashId(url || `${headline}-${publishedAt.toISOString()}`);

    // Infer news type
    const type = this.inferNewsType(headline, content || "");

    return {
      externalId,
      type,
      headline,
      content,
      url,
      imageUrl,
      publishedAt,
      author,
      rawData: {
        html: $el.html(),
        url: config.url,
      },
    };
  }

  /**
   * Infer news type from title and content.
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
      text.includes("day-to-day")
    ) {
      return "INJURY";
    }
    if (text.includes("breaking") || text.includes("just in") || text.includes("developing")) {
      return "BREAKING";
    }
    if (text.includes("odds") || text.includes("betting") || text.includes("line")) {
      return "BETTING_LINE";
    }
    if (
      text.includes("final") ||
      text.includes("score") ||
      text.includes("win") ||
      text.includes("defeat")
    ) {
      return "GAME_RESULT";
    }
    if (text.includes("rumor") || text.includes("reportedly") || text.includes("sources say")) {
      return "RUMOR";
    }
    if (text.includes("schedule") || text.includes("upcoming") || text.includes("matchup")) {
      return "SCHEDULE";
    }

    return "ANALYSIS";
  }

  /**
   * Create a short hash from a string for external ID.
   */
  private hashId(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `scrape-${Math.abs(hash).toString(36)}`;
  }
}

// Export singleton instance
export const scraperAdapter = new ScraperAdapter();
