import type { SourceType } from "@prisma/client";
import type { SourceAdapter } from "./base-adapter";
import { rssAdapter } from "./rss-adapter";
import { scraperAdapter } from "./scraper-adapter";
import { espnAdapter } from "./espn-adapter";
import { draftKingsAdapter } from "./draftkings-adapter";
import { draftKingsScraperAdapter } from "./draftkings-scraper";

/**
 * Registry of all available source adapters.
 */
const adapterRegistry = new Map<SourceType, SourceAdapter>();
adapterRegistry.set("RSS_FEED", rssAdapter);
adapterRegistry.set("WEBSITE_SCRAPE", scraperAdapter);
adapterRegistry.set("ESPN_API", espnAdapter);
adapterRegistry.set("DRAFTKINGS_API", draftKingsAdapter);
adapterRegistry.set("DRAFTKINGS_SCRAPE", draftKingsScraperAdapter);

/**
 * Get the appropriate adapter for a source type.
 * @param type - The source type
 * @returns The adapter instance or undefined if not found
 */
export function getAdapter(type: SourceType): SourceAdapter | undefined {
  return adapterRegistry.get(type);
}

/**
 * Get the adapter for a source type, throwing if not found.
 * @param type - The source type
 * @returns The adapter instance
 * @throws Error if adapter is not found
 */
export function getAdapterOrThrow(type: SourceType): SourceAdapter {
  const adapter = getAdapter(type);
  if (!adapter) {
    throw new Error(`No adapter found for source type: ${type}`);
  }
  return adapter;
}

/**
 * Check if an adapter exists for a source type.
 * @param type - The source type
 * @returns true if adapter exists
 */
export function hasAdapter(type: SourceType): boolean {
  return adapterRegistry.has(type);
}

/**
 * Get all registered source types.
 * @returns Array of registered source types
 */
export function getRegisteredTypes(): SourceType[] {
  return Array.from(adapterRegistry.keys());
}

/**
 * Get all adapters.
 * @returns Map of source type to adapter
 */
export function getAllAdapters(): Map<SourceType, SourceAdapter> {
  return new Map(adapterRegistry);
}

/**
 * Source type metadata for UI display.
 */
export interface SourceTypeInfo {
  type: SourceType;
  name: string;
  description: string;
  icon: string;
  configFields: ConfigField[];
  recommendedRefreshInterval: number; // minutes
  supportsOdds: boolean;
  supportsResults: boolean;
}

export interface ConfigField {
  name: string;
  label: string;
  type: "text" | "url" | "number" | "select" | "textarea" | "json";
  required: boolean;
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
}

/**
 * Get metadata about a source type for UI display.
 */
export function getSourceTypeInfo(type: SourceType): SourceTypeInfo | undefined {
  return sourceTypeInfoMap.get(type);
}

/**
 * Get metadata for all source types.
 */
export function getAllSourceTypeInfo(): SourceTypeInfo[] {
  return Array.from(sourceTypeInfoMap.values());
}

/**
 * Metadata for each source type.
 */
const sourceTypeInfoMap = new Map<SourceType, SourceTypeInfo>([
  [
    "RSS_FEED",
    {
      type: "RSS_FEED",
      name: "RSS Feed",
      description: "Fetch news from RSS or Atom feeds",
      icon: "rss",
      recommendedRefreshInterval: 30,
      supportsOdds: false,
      supportsResults: false,
      configFields: [
        {
          name: "feedUrl",
          label: "Feed URL",
          type: "url",
          required: true,
          placeholder: "https://example.com/feed.xml",
          description: "The URL of the RSS or Atom feed",
        },
        {
          name: "maxItems",
          label: "Max Items",
          type: "number",
          required: false,
          placeholder: "50",
          description: "Maximum number of items to fetch per run",
          defaultValue: 50,
        },
      ],
    },
  ],
  [
    "WEBSITE_SCRAPE",
    {
      type: "WEBSITE_SCRAPE",
      name: "Website Scraper",
      description: "Scrape news from websites using CSS selectors",
      icon: "globe",
      recommendedRefreshInterval: 60,
      supportsOdds: false,
      supportsResults: false,
      configFields: [
        {
          name: "url",
          label: "Page URL",
          type: "url",
          required: true,
          placeholder: "https://example.com/news",
          description: "The URL of the page to scrape",
        },
        {
          name: "selectors.container",
          label: "Container Selector",
          type: "text",
          required: false,
          placeholder: ".news-list",
          description: "CSS selector for the container holding news items",
        },
        {
          name: "selectors.headline",
          label: "Headline Selector",
          type: "text",
          required: true,
          placeholder: "h2.title, .headline",
          description: "CSS selector for the headline/title",
        },
        {
          name: "selectors.content",
          label: "Content Selector",
          type: "text",
          required: false,
          placeholder: ".summary, .excerpt",
          description: "CSS selector for the content/description",
        },
        {
          name: "selectors.date",
          label: "Date Selector",
          type: "text",
          required: false,
          placeholder: ".date, time",
          description: "CSS selector for the publication date",
        },
        {
          name: "selectors.link",
          label: "Link Selector",
          type: "text",
          required: false,
          placeholder: "a.read-more",
          description: "CSS selector for the article link",
        },
        {
          name: "maxItems",
          label: "Max Items",
          type: "number",
          required: false,
          placeholder: "25",
          description: "Maximum number of items to fetch per run",
          defaultValue: 25,
        },
      ],
    },
  ],
  [
    "ESPN_API",
    {
      type: "ESPN_API",
      name: "ESPN",
      description: "Fetch sports news and scores from ESPN",
      icon: "trophy",
      recommendedRefreshInterval: 30,
      supportsOdds: false,
      supportsResults: true,
      configFields: [
        {
          name: "section",
          label: "Section",
          type: "select",
          required: true,
          description: "What type of content to fetch",
          options: [
            { value: "news", label: "News Articles" },
            { value: "scores", label: "Game Scores" },
          ],
          defaultValue: "news",
        },
        {
          name: "sport",
          label: "Sport Override",
          type: "text",
          required: false,
          placeholder: "football",
          description: "Override the sport (uses source sport by default)",
        },
        {
          name: "league",
          label: "League Override",
          type: "text",
          required: false,
          placeholder: "nfl",
          description: "Override the league (uses default for sport)",
        },
      ],
    },
  ],
  [
    "DRAFTKINGS_API",
    {
      type: "DRAFTKINGS_API",
      name: "DraftKings API",
      description: "Fetch betting odds from DraftKings Sportsbook API (may be geo-restricted)",
      icon: "dollar-sign",
      recommendedRefreshInterval: 15,
      supportsOdds: true,
      supportsResults: false,
      configFields: [
        {
          name: "sport",
          label: "Sport",
          type: "select",
          required: true,
          description: "The sport to fetch odds for",
          options: [
            { value: "nfl", label: "NFL Football" },
            { value: "nba", label: "NBA Basketball" },
            { value: "mlb", label: "MLB Baseball" },
            { value: "nhl", label: "NHL Hockey" },
            { value: "soccer", label: "Soccer" },
          ],
          defaultValue: "nfl",
        },
        {
          name: "league",
          label: "League",
          type: "text",
          required: false,
          placeholder: "nfl",
          description: "Specific league (optional)",
        },
      ],
    },
  ],
  [
    "DRAFTKINGS_SCRAPE",
    {
      type: "DRAFTKINGS_SCRAPE",
      name: "DraftKings Scraper",
      description: "Scrape betting odds from DraftKings website using browser automation",
      icon: "dollar-sign",
      recommendedRefreshInterval: 15,
      supportsOdds: true,
      supportsResults: false,
      configFields: [
        {
          name: "sport",
          label: "Sport",
          type: "select",
          required: true,
          description: "The sport to fetch odds for",
          options: [
            { value: "nfl", label: "NFL Football" },
            { value: "nba", label: "NBA Basketball" },
            { value: "mlb", label: "MLB Baseball" },
            { value: "nhl", label: "NHL Hockey" },
            { value: "soccer", label: "Soccer" },
          ],
          defaultValue: "nfl",
        },
      ],
    },
  ],
  [
    "TWITTER_SEARCH",
    {
      type: "TWITTER_SEARCH",
      name: "X/Twitter Search",
      description: "Search for tweets by keywords (requires API access)",
      icon: "twitter",
      recommendedRefreshInterval: 15,
      supportsOdds: false,
      supportsResults: false,
      configFields: [
        {
          name: "searchQuery",
          label: "Search Query",
          type: "text",
          required: true,
          placeholder: "NFL trade OR NFL injury",
          description: "Twitter search query (supports operators)",
        },
        {
          name: "maxResults",
          label: "Max Results",
          type: "number",
          required: false,
          placeholder: "100",
          description: "Maximum tweets per request (max 100)",
          defaultValue: 100,
        },
        {
          name: "includeRetweets",
          label: "Include Retweets",
          type: "select",
          required: false,
          options: [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ],
          defaultValue: "false",
        },
      ],
    },
  ],
  [
    "TWITTER_LIST",
    {
      type: "TWITTER_LIST",
      name: "X/Twitter List",
      description: "Fetch tweets from a Twitter list (requires API access)",
      icon: "twitter",
      recommendedRefreshInterval: 15,
      supportsOdds: false,
      supportsResults: false,
      configFields: [
        {
          name: "listId",
          label: "List ID",
          type: "text",
          required: true,
          placeholder: "1234567890",
          description: "The Twitter list ID to fetch from",
        },
        {
          name: "maxResults",
          label: "Max Results",
          type: "number",
          required: false,
          placeholder: "100",
          description: "Maximum tweets per request (max 100)",
          defaultValue: 100,
        },
      ],
    },
  ],
]);

// Re-export adapter instances for direct use
export { rssAdapter, scraperAdapter, espnAdapter, draftKingsAdapter, draftKingsScraperAdapter };
