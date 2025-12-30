/**
 * CLI Input Validation Schemas using TypeBox
 * Provides runtime validation for complex CLI inputs like date ranges and keywords
 */

import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// ============================================================================
// Date Range Validation
// ============================================================================

/**
 * Date string in ISO format (YYYY-MM-DD)
 */
export const DateString = Type.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "Date in YYYY-MM-DD format",
});

export type DateString = Static<typeof DateString>;

/**
 * Date range for scraping/searching
 */
export const DateRange = Type.Object({
  start: DateString,
  end: DateString,
});

export type DateRange = Static<typeof DateRange>;

/**
 * Relative time range (e.g., "7d", "30d", "3m")
 */
export const RelativeTimeRange = Type.String({
  pattern: "^\\d+[dwmyDWMY]$",
  description: "Relative time range (e.g., 7d for 7 days, 3m for 3 months)",
});

export type RelativeTimeRange = Static<typeof RelativeTimeRange>;

// ============================================================================
// Keywords Validation
// ============================================================================

/**
 * Single keyword (no special chars except hyphen and underscore)
 */
export const Keyword = Type.String({
  minLength: 1,
  maxLength: 100,
  pattern: "^[\\w\\s-]+$",
  description: "Search keyword",
});

export type Keyword = Static<typeof Keyword>;

/**
 * List of keywords for filtering
 */
export const KeywordList = Type.Array(Keyword, {
  minItems: 1,
  maxItems: 20,
  description: "List of keywords to filter by",
});

export type KeywordList = Static<typeof KeywordList>;

// ============================================================================
// Username Validation
// ============================================================================

/**
 * Twitter/X username (without @ symbol)
 */
export const Username = Type.String({
  minLength: 1,
  maxLength: 15,
  pattern: "^[a-zA-Z0-9_]+$",
  description: "Twitter username (without @ symbol)",
});

export type Username = Static<typeof Username>;

// ============================================================================
// Scrape Command Options
// ============================================================================

export const ScrapeOptions = Type.Object({
  username: Username,
  includeReplies: Type.Optional(Type.Boolean({ default: false })),
  includeRetweets: Type.Optional(Type.Boolean({ default: false })),
  maxTweets: Type.Optional(
    Type.Number({ minimum: 1, maximum: 10000, default: 100 }),
  ),
  keywords: Type.Optional(KeywordList),
  since: Type.Optional(DateString),
  until: Type.Optional(DateString),
  rateLimitProfile: Type.Optional(
    Type.Union([
      Type.Literal("conservative"),
      Type.Literal("moderate"),
      Type.Literal("aggressive"),
    ]),
  ),
});

export type ScrapeOptions = Static<typeof ScrapeOptions>;

// ============================================================================
// Search Command Options
// ============================================================================

export const SearchMode = Type.Union([
  Type.Literal("latest"),
  Type.Literal("top"),
]);

export type SearchMode = Static<typeof SearchMode>;

export const SearchOptions = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 500 }),
  maxTweets: Type.Optional(
    Type.Number({ minimum: 1, maximum: 10000, default: 100 }),
  ),
  days: Type.Optional(Type.Number({ minimum: 1, maximum: 365 })),
  since: Type.Optional(DateString),
  until: Type.Optional(DateString),
  mode: Type.Optional(SearchMode),
  embed: Type.Optional(Type.Boolean({ default: false })),
});

export type SearchOptions = Static<typeof SearchOptions>;

// ============================================================================
// Discover Command Options
// ============================================================================

export const DiscoverOptions = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 200 }),
  maxResults: Type.Optional(
    Type.Number({ minimum: 1, maximum: 100, default: 20 }),
  ),
  save: Type.Optional(Type.Boolean({ default: false })),
});

export type DiscoverOptions = Static<typeof DiscoverOptions>;

// ============================================================================
// Ask Command Options
// ============================================================================

export const AskOptions = Type.Object({
  question: Type.String({ minLength: 1, maxLength: 1000 }),
  topK: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 5 })),
  model: Type.Optional(Type.String({ default: "gpt-4o-mini" })),
});

export type AskOptions = Static<typeof AskOptions>;

// ============================================================================
// Embed Command Options
// ============================================================================

export const EmbedOptions = Type.Object({
  model: Type.Optional(Type.String({ default: "text-embedding-3-small" })),
  batchSize: Type.Optional(
    Type.Number({ minimum: 1, maximum: 2000, default: 1000 }),
  ),
  searchSessionId: Type.Optional(Type.Number({ minimum: 1 })),
});

export type EmbedOptions = Static<typeof EmbedOptions>;

// ============================================================================
// Config Command Options
// ============================================================================

export const ConfigKeyPath = Type.String({
  pattern: "^[a-zA-Z]+\\.[a-zA-Z]+$",
  description: "Configuration key path (e.g., api.openaiKey)",
});

export type ConfigKeyPath = Static<typeof ConfigKeyPath>;

// ============================================================================
// Validation Functions
// ============================================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Validate input against a schema
 */
export function validate<T>(
  schema: Parameters<typeof Value.Check>[0],
  value: unknown,
): ValidationResult<T> {
  const errors = [...Value.Errors(schema, value)];

  if (errors.length === 0) {
    return {
      success: true,
      data: value as T,
    };
  }

  return {
    success: false,
    errors: errors.map((err) => `${err.path}: ${err.message}`),
  };
}

/**
 * Validate and throw on error
 */
export function validateOrThrow<T>(
  schema: Parameters<typeof Value.Check>[0],
  value: unknown,
  context?: string,
): T {
  const result = validate<T>(schema, value);

  if (!result.success) {
    const errorMessage = result.errors?.join("; ") || "Validation failed";
    throw new Error(context ? `${context}: ${errorMessage}` : errorMessage);
  }

  return result.data as T;
}

/**
 * Parse a relative time range string into start and end dates
 */
export function parseRelativeTimeRange(range: string): {
  start: Date;
  end: Date;
} {
  const match = range.match(/^(\d+)([dwmyDWMY])$/);
  if (!match) {
    throw new Error(`Invalid time range format: ${range}`);
  }

  const amount = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();

  const end = new Date();
  const start = new Date();

  switch (unit) {
    case "d":
      start.setDate(start.getDate() - amount);
      break;
    case "w":
      start.setDate(start.getDate() - amount * 7);
      break;
    case "m":
      start.setMonth(start.getMonth() - amount);
      break;
    case "y":
      start.setFullYear(start.getFullYear() - amount);
      break;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }

  return { start, end };
}

/**
 * Parse date string to Date object
 */
export function parseDate(dateStr: string): Date {
  const result = validate(DateString, dateStr);
  if (!result.success) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  return date;
}

/**
 * Parse comma-separated keywords string
 */
export function parseKeywords(keywordsStr: string): string[] {
  const keywords = keywordsStr
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const result = validate(KeywordList, keywords);
  if (!result.success) {
    throw new Error(
      `Invalid keywords: ${result.errors?.join(", ") || "validation failed"}`,
    );
  }

  return keywords;
}

/**
 * Parse and validate username (strip @ if present)
 */
export function parseUsername(usernameStr: string): string {
  const username = usernameStr.startsWith("@")
    ? usernameStr.slice(1)
    : usernameStr;

  const result = validate(Username, username);
  if (!result.success) {
    throw new Error(
      `Invalid username: ${result.errors?.join(", ") || "validation failed"}`,
    );
  }

  return username;
}
