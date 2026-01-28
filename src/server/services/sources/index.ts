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
  registerAdapter,
  type SourceTypeInfo,
  type ConfigField,
} from "./adapter-factory";

// Note: Individual adapter exports removed to prevent eager loading
// of browser-incompatible dependencies (cheerio/undici) in RSC.
// Use getAdapter() or getAdapterOrThrow() instead.
