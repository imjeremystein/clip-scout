import type { Source } from "@prisma/client";
import type {
  SourceType,
  FetchOptions,
  FetchResult,
  ValidationResult,
  RateLimitStatus,
  SourceConfig,
  RawOddsData,
  RawGameResult,
} from "./types";

/**
 * Base interface for all source adapters.
 * Each adapter is responsible for fetching data from a specific source type.
 */
export interface SourceAdapter {
  /** The source type this adapter handles */
  readonly type: SourceType;

  /** Human-readable name for this adapter */
  readonly name: string;

  /**
   * Fetch new items from the source.
   * @param source - The source configuration from the database
   * @param options - Fetch options (since date, limit, dry run)
   * @returns FetchResult with items and rate limit info
   */
  fetch(source: Source, options?: FetchOptions): Promise<FetchResult>;

  /**
   * Validate source configuration before saving.
   * @param config - The configuration to validate
   * @returns ValidationResult with errors and warnings
   */
  validateConfig(config: unknown): ValidationResult;

  /**
   * Get current rate limit status for this adapter.
   * @returns RateLimitStatus with remaining requests and reset time
   */
  getRateLimitStatus(): RateLimitStatus;

  /**
   * Test the connection to the source.
   * @param config - The configuration to test
   * @returns true if connection is successful
   */
  testConnection?(config: SourceConfig): Promise<boolean>;
}

/**
 * Extended interface for adapters that fetch betting odds.
 */
export interface OddsAdapter extends SourceAdapter {
  /**
   * Fetch current betting odds.
   * @param source - The source configuration
   * @param options - Fetch options
   * @returns Array of odds data
   */
  fetchOdds(source: Source, options?: FetchOptions): Promise<RawOddsData[]>;
}

/**
 * Extended interface for adapters that fetch game results.
 */
export interface ResultsAdapter extends SourceAdapter {
  /**
   * Fetch game results/scores.
   * @param source - The source configuration
   * @param options - Fetch options
   * @returns Array of game results
   */
  fetchResults(source: Source, options?: FetchOptions): Promise<RawGameResult[]>;
}

/**
 * Type guard to check if adapter supports odds fetching.
 */
export function isOddsAdapter(adapter: SourceAdapter): adapter is OddsAdapter {
  return "fetchOdds" in adapter && typeof adapter.fetchOdds === "function";
}

/**
 * Type guard to check if adapter supports results fetching.
 */
export function isResultsAdapter(adapter: SourceAdapter): adapter is ResultsAdapter {
  return "fetchResults" in adapter && typeof adapter.fetchResults === "function";
}

/**
 * Abstract base class with common adapter functionality.
 */
export abstract class BaseAdapter implements SourceAdapter {
  abstract readonly type: SourceType;
  abstract readonly name: string;

  protected rateLimitRemaining: number = Infinity;
  protected rateLimitReset?: Date;
  protected rateLimitTotal: number = Infinity;

  abstract fetch(source: Source, options?: FetchOptions): Promise<FetchResult>;
  abstract validateConfig(config: unknown): ValidationResult;

  getRateLimitStatus(): RateLimitStatus {
    const isLimited =
      this.rateLimitRemaining <= 0 &&
      this.rateLimitReset !== undefined &&
      this.rateLimitReset > new Date();

    return {
      remaining: this.rateLimitRemaining,
      limit: this.rateLimitTotal,
      resetAt: this.rateLimitReset,
      isLimited,
    };
  }

  /**
   * Update rate limit info from API response headers or body.
   */
  protected updateRateLimit(remaining: number, reset?: Date, total?: number): void {
    this.rateLimitRemaining = remaining;
    this.rateLimitReset = reset;
    if (total !== undefined) {
      this.rateLimitTotal = total;
    }
  }

  /**
   * Check if we should wait due to rate limiting.
   */
  protected shouldWaitForRateLimit(): boolean {
    return this.getRateLimitStatus().isLimited;
  }

  /**
   * Get time to wait before next request (in ms).
   */
  protected getWaitTime(): number {
    if (!this.rateLimitReset) return 0;
    const waitMs = this.rateLimitReset.getTime() - Date.now();
    return Math.max(0, waitMs);
  }

  /**
   * Helper to parse configuration safely.
   */
  protected parseConfig<T extends SourceConfig>(source: Source): T {
    const config = source.config as unknown;
    if (!config || typeof config !== "object") {
      throw new Error("Invalid source configuration");
    }
    return config as T;
  }

  /**
   * Helper to create a validation error result.
   */
  protected validationError(errors: string[]): ValidationResult {
    return { valid: false, errors };
  }

  /**
   * Helper to create a validation success result.
   */
  protected validationSuccess(warnings?: string[]): ValidationResult {
    return { valid: true, errors: [], warnings };
  }
}
