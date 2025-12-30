/**
 * CLI Input Validation Module
 * Re-exports all validation schemas and utilities
 */

export {
  // Date validation
  DateString,
  DateRange,
  RelativeTimeRange,
  // Keywords validation
  Keyword,
  KeywordList,
  // Username validation
  Username,
  // Command options schemas
  ScrapeOptions,
  SearchOptions,
  SearchMode,
  DiscoverOptions,
  AskOptions,
  EmbedOptions,
  ConfigKeyPath,
  // Validation functions
  validate,
  validateOrThrow,
  // Parsing utilities
  parseRelativeTimeRange,
  parseDate,
  parseKeywords,
  parseUsername,
} from "./schemas.js";

export type { ValidationResult } from "./schemas.js";

// Re-export types
export type {
  DateString as DateStringType,
  DateRange as DateRangeType,
  RelativeTimeRange as RelativeTimeRangeType,
  Keyword as KeywordType,
  KeywordList as KeywordListType,
  Username as UsernameType,
  ScrapeOptions as ScrapeOptionsType,
  SearchOptions as SearchOptionsType,
  SearchMode as SearchModeType,
  DiscoverOptions as DiscoverOptionsType,
  AskOptions as AskOptionsType,
  EmbedOptions as EmbedOptionsType,
  ConfigKeyPath as ConfigKeyPathType,
} from "./schemas.js";
