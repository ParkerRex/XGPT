// Common types used across the application

export interface Tweet {
  id: string;
  text: string;
  user?: string;
  created_at?: string;
  metadata?: Record<string, any>;
}

export interface TweetWithEmbedding extends Tweet {
  vec: number[];
}

export interface Row {
  id: string;
  text: string;
  vec: number[];
}

export interface ScrapingOptions {
  username: string;
  includeReplies?: boolean;
  includeRetweets?: boolean;
  keywords?: string[];
  maxTweets?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
  rateLimitProfile?: string;
}

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
  inputFile?: string;
  outputFile?: string;
  searchSessionId?: number; // Filter to only embed tweets from a specific search session
}

export interface QueryOptions {
  question: string;
  topK?: number;
  model?: string;
  vectorFile?: string;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export interface SearchOptions {
  query?: string;
  name?: string;
  maxTweets: number;
  days?: number;
  since?: string;
  until?: string;
  mode: "latest" | "top";
  embed: boolean;
  dryRun: boolean;
  json: boolean;
  resume?: number;
  cleanup?: boolean;
  olderThan?: string;
}

export interface SearchStats {
  tweetsCollected: number;
  totalProcessed: number;
  duplicatesSkipped: number;
  usersCreated: number;
  embeddingsGenerated?: boolean;
  sessionId?: number;
}

// Pagination types
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
