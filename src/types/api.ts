/**
 * Shared API types between CLI commands and web server
 * Provides type-safe interfaces for command results and API responses
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Generic command result with strongly-typed data
 */
export interface TypedCommandResult<T = undefined> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// ============================================================================
// Scrape Command Types
// ============================================================================

export interface ScrapeResultData {
  tweetsCollected: number;
  sessionId: number;
  username: string;
  includeReplies: boolean;
  includeRetweets: boolean;
  keywords?: string[];
  rateLimitProfile: string;
}

export type ScrapeCommandResult = TypedCommandResult<ScrapeResultData>;

// ============================================================================
// Search Command Types
// ============================================================================

export interface SearchResultData {
  tweetsCollected: number;
  totalProcessed: number;
  duplicatesSkipped: number;
  usersCreated: number;
  embeddingsGenerated?: boolean;
  sessionId?: number;
}

export type SearchCommandResult = TypedCommandResult<SearchResultData>;

// ============================================================================
// Discover Command Types
// ============================================================================

export interface DiscoveredProfile {
  username: string;
  name?: string;
  bio?: string;
  followers?: number;
  following?: number;
  tweets?: number;
  location?: string;
  website?: string;
  verified?: boolean;
  joined?: Date;
}

export interface DiscoverResultData {
  profiles: DiscoveredProfile[];
  savedCount: number;
}

export type DiscoverCommandResult = TypedCommandResult<DiscoverResultData>;

// ============================================================================
// Ask Command Types
// ============================================================================

export interface RelevantTweet {
  text: string;
  similarity: number;
  user?: string;
  created_at?: string;
}

export interface AskResultData {
  question: string;
  answer: string;
  relevantTweets: RelevantTweet[];
  model: string;
  topK: number;
}

export type AskCommandResult = TypedCommandResult<AskResultData>;

// ============================================================================
// Embed Command Types
// ============================================================================

export interface EmbedResultData {
  tweetsEmbedded: number;
  model: string;
  vectorDimensions: number;
  embeddingsInDatabase: number;
}

export type EmbedCommandResult = TypedCommandResult<EmbedResultData>;

// ============================================================================
// Config Command Types
// ============================================================================

export interface ConfigGetResultData {
  key: string;
  value: unknown;
  description?: string;
}

export interface ConfigSetResultData {
  key: string;
  value: unknown;
  description?: string;
}

export interface ConfigInfoResultData {
  configPath: string;
  exists: boolean;
}

export type ConfigGetResult = TypedCommandResult<ConfigGetResultData>;
export type ConfigSetResult = TypedCommandResult<ConfigSetResultData>;
export type ConfigInfoResult = TypedCommandResult<ConfigInfoResultData>;

// ============================================================================
// Interactive Command Types
// ============================================================================

export interface InteractiveResultData {
  session: Record<string, unknown>;
  scrapeResult?: ScrapeResultData;
}

export type InteractiveCommandResult =
  TypedCommandResult<InteractiveResultData>;

// ============================================================================
// Job Types (for API responses)
// ============================================================================

export type JobType = "scrape" | "search" | "embed" | "discover";
export type JobStatus = "running" | "completed" | "failed" | "cancelled";

export interface JobProgress {
  current: number;
  total: number;
  message: string;
}

export interface JobResponse {
  id: string;
  type: JobType;
  status: JobStatus;
  startedAt: string;
  completedAt?: string;
  progress: JobProgress;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

// ============================================================================
// API Request Types
// ============================================================================

export interface ScrapeRequest {
  username: string;
  includeReplies?: boolean;
  includeRetweets?: boolean;
  maxTweets?: number;
}

export interface SearchRequest {
  query: string;
  maxTweets?: number;
  days?: number;
  mode?: "latest" | "top";
  embed?: boolean;
}

export interface DiscoverRequest {
  query: string;
  maxResults?: number;
  save?: boolean;
}

export interface AskRequest {
  question: string;
  topK?: number;
  model?: string;
}

export interface EmbedRequest {
  model?: string;
  batchSize?: number;
}

export interface ConfigSetRequest {
  key: string;
  value: string;
}
