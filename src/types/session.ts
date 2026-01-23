// Session types for interactive CLI experience

export interface SessionConfig {
  // Content type selection
  contentType: 'tweets' | 'replies' | 'both';

  // Search scope
  searchScope: 'all' | 'keywords';
  keywords?: string[];

  // Time range
  timeRange: 'week' | 'month' | '3months' | '6months' | 'year' | 'lifetime' | 'custom';
  customDateRange?: {
    start: Date;
    end: Date;
  };

  // User and limits
  username: string;
  maxTweets: number;

  // Rate limiting
  rateLimitProfile: string;

  // Processing options
  generateEmbeddings: boolean;
  embeddingModel: string;

  // Output preferences
  outputFormat: 'json' | 'jsonl' | 'csv' | 'markdown' | 'txt';
  outputFile?: string;
}

export interface PromptSession {
  config: Partial<SessionConfig>;
  step: 'content-type' | 'search-scope' | 'time-range' | 'confirmation' | 'processing';
  startTime: Date;
  username?: string;
}

export const DEFAULT_SESSION_CONFIG: Partial<SessionConfig> = {
  contentType: 'tweets',
  searchScope: 'all',
  timeRange: 'lifetime',
  maxTweets: 10000,
  rateLimitProfile: 'conservative',
  generateEmbeddings: true,
  embeddingModel: 'text-embedding-3-small',
  outputFormat: 'json'
};

export const CONTENT_TYPE_OPTIONS = [
  {
    name: 'Tweets only',
    value: 'tweets' as const,
    description: 'Only original tweets (no replies or retweets)'
  },
  {
    name: 'Replies only',
    value: 'replies' as const,
    description: 'Only replies to other tweets'
  },
  {
    name: 'Both tweets and replies',
    value: 'both' as const,
    description: 'Include both original tweets and replies'
  }
];

export const TIME_RANGE_OPTIONS = [
  {
    name: 'Last week',
    value: 'week' as const,
    description: 'Tweets from the past 7 days'
  },
  {
    name: 'Last month',
    value: 'month' as const,
    description: 'Tweets from the past 30 days'
  },
  {
    name: 'Last 3 months',
    value: '3months' as const,
    description: 'Tweets from the past 90 days'
  },
  {
    name: 'Last 6 months',
    value: '6months' as const,
    description: 'Tweets from the past 180 days'
  },
  {
    name: 'Last year',
    value: 'year' as const,
    description: 'Tweets from the past 365 days'
  },
  {
    name: 'All time (lifetime)',
    value: 'lifetime' as const,
    description: 'All available tweets from this user'
  },
  {
    name: 'Custom date range',
    value: 'custom' as const,
    description: 'Specify your own start and end dates'
  }
];
