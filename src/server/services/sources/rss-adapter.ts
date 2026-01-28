import type { Source } from "@prisma/client";
import Parser from "rss-parser";
import type {
  FetchOptions,
  FetchResult,
  ValidationResult,
  RawNewsItem,
  RssFeedConfig,
  NewsItemType,
} from "./types";
import { BaseAdapter } from "./base-adapter";

/**
 * RSS Feed Adapter
 * Fetches news items from RSS/Atom feeds using rss-parser.
 */
export class RssAdapter extends BaseAdapter {
  readonly type = "RSS_FEED" as const;
  readonly name = "RSS Feed";

  private parser: Parser;

  constructor() {
    super();
    this.parser = new Parser({
      timeout: 30000, // 30 second timeout
      headers: {
        "User-Agent": process.env.SCRAPER_USER_AGENT ||
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      customFields: {
        item: [
          ["media:content", "media"],
          ["media:thumbnail", "thumbnail"],
          ["dc:creator", "dcCreator"],
          ["content:encoded", "contentEncoded"],
        ],
      },
    });
  }

  async fetch(source: Source, options?: FetchOptions): Promise<FetchResult> {
    const config = this.parseConfig<RssFeedConfig>(source);
    const items: RawNewsItem[] = [];

    try {
      const feed = await this.parser.parseURL(config.feedUrl);

      for (const item of feed.items) {
        // Skip items older than 'since' date if specified
        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
        if (options?.since && publishedAt < options.since) {
          continue;
        }

        // Respect limit
        if (options?.limit && items.length >= options.limit) {
          break;
        }

        // Respect maxItems from config
        if (config.maxItems && items.length >= config.maxItems) {
          break;
        }

        const rawItem = this.parseItem(item, source.sport);
        if (rawItem) {
          items.push(rawItem);
        }
      }

      return {
        items,
        hasMore: false, // RSS feeds don't typically paginate
        metadata: {
          feedTitle: feed.title,
          feedDescription: feed.description,
          feedLink: feed.link,
          lastBuildDate: feed.lastBuildDate,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch RSS feed: ${errorMessage}`);
    }
  }

  validateConfig(config: unknown): ValidationResult {
    if (!config || typeof config !== "object") {
      return this.validationError(["Configuration must be an object"]);
    }

    const cfg = config as Record<string, unknown>;
    const errors: string[] = [];

    // Required: feedUrl
    if (!cfg.feedUrl || typeof cfg.feedUrl !== "string") {
      errors.push("feedUrl is required and must be a string");
    } else {
      try {
        new URL(cfg.feedUrl);
      } catch {
        errors.push("feedUrl must be a valid URL");
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

    return this.validationSuccess();
  }

  async testConnection(config: RssFeedConfig): Promise<boolean> {
    try {
      const feed = await this.parser.parseURL(config.feedUrl);
      return feed.items.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Parse a single RSS item into a RawNewsItem.
   */
  private parseItem(
    item: Parser.Item & {
      media?: { $?: { url?: string } };
      thumbnail?: { $?: { url?: string } };
      dcCreator?: string;
      contentEncoded?: string;
    },
    sport: Source["sport"]
  ): RawNewsItem | null {
    // Skip items without required fields
    if (!item.title && !item.link) {
      return null;
    }

    // Generate a stable external ID
    const externalId = item.guid || item.link || `${item.title}-${item.pubDate}`;

    // Extract image URL from various possible locations
    const imageUrl =
      item.media?.$?.url ||
      item.thumbnail?.$?.url ||
      this.extractImageFromContent(item.content || item.contentEncoded || "");

    // Determine news type based on content analysis
    const type = this.inferNewsType(item.title || "", item.content || "");

    // Get content and strip HTML tags
    const rawContent = item.contentEncoded || item.content || item.contentSnippet || "";
    const cleanContent = this.stripHtml(rawContent);

    return {
      externalId: this.hashId(externalId),
      type,
      headline: item.title || "Untitled",
      content: cleanContent,
      url: item.link || undefined,
      imageUrl,
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      author: item.creator || item.dcCreator || undefined,
      rawData: item,
    };
  }

  /**
   * Strip HTML tags from content and clean up whitespace.
   */
  private stripHtml(html: string): string {
    return html
      // Remove script and style elements entirely
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      // Replace block-level elements with newlines
      .replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      // Remove all remaining HTML tags
      .replace(/<[^>]+>/g, "")
      // Decode common HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      // Clean up whitespace
      .replace(/\n\s*\n/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  /**
   * Extract first image URL from HTML content.
   */
  private extractImageFromContent(content: string): string | undefined {
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    return imgMatch?.[1];
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
    if (text.includes("final") || text.includes("score") || text.includes("win") || text.includes("defeat")) {
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
      hash = hash & hash; // Convert to 32bit integer
    }
    return `rss-${Math.abs(hash).toString(36)}`;
  }
}

// Export singleton instance
export const rssAdapter = new RssAdapter();
