// Export types
export * from "./types";

// Export base adapter
export {
  type SourceAdapter,
  type OddsAdapter,
  type ResultsAdapter,
  isOddsAdapter,
  isResultsAdapter,
  BaseAdapter,
} from "./base-adapter";

// Export adapter factory
export {
  getAdapter,
  getAdapterOrThrow,
  hasAdapter,
  getRegisteredTypes,
  getAllAdapters,
  getSourceTypeInfo,
  getAllSourceTypeInfo,
  type SourceTypeInfo,
  type ConfigField,
} from "./adapter-factory";

// Export individual adapters
export { rssAdapter, RssAdapter } from "./rss-adapter";
export { scraperAdapter, ScraperAdapter } from "./scraper-adapter";
export { espnAdapter, EspnAdapter } from "./espn-adapter";
export { draftKingsAdapter, DraftKingsAdapter } from "./draftkings-adapter";
