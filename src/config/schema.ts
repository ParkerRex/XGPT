/**
 * Configuration schema and types for XGPT CLI
 * Defines user preferences and settings that can be persisted
 */

export interface UserConfig {
  // API Configuration
  api: {
    openaiKey?: string;
    authToken?: string;
    ct0Token?: string;
  };

  // Default Scraping Preferences
  scraping: {
    rateLimitProfile: 'conservative' | 'moderate' | 'aggressive';
    maxTweets: number;
    includeReplies: boolean;
    includeRetweets: boolean;
    pageDelayMs: number;
    maxPages?: number;
    defaultKeywords: string[];
    defaultTimeRange: 'last-week' | 'last-month' | 'last-3-months' | 'last-6-months' | 'last-year' | 'lifetime';
  };

  // Embedding Preferences
  embedding: {
    model: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
    batchSize: number;
    autoGenerate: boolean;
  };

  // Query Preferences
  query: {
    defaultTopK: number;
    defaultThreshold: number;
    showSources: boolean;
  };

  // Output Preferences
  output: {
    format: 'json' | 'jsonl' | 'csv' | 'markdown' | 'txt';
    includeMetadata: boolean;
    timestampFormat: 'iso' | 'relative' | 'human';
  };

  // UI Preferences
  ui: {
    showProgressBars: boolean;
    verboseLogging: boolean;
    colorOutput: boolean;
    confirmDestructiveActions: boolean;
  };

  // Advanced Settings
  advanced: {
    databasePath?: string;
    cacheEnabled: boolean;
    cacheTtlHours: number;
    queryIdCacheMaxEntries: number;
    queryIdCacheSnapshotEnabled: boolean;
    backupEnabled: boolean;
    maxBackupFiles: number;
  };
}

export const DEFAULT_CONFIG: UserConfig = {
  api: {
    // API keys will be loaded from environment variables if not set
  },

  scraping: {
    rateLimitProfile: 'conservative',
    maxTweets: 1000,
    includeReplies: false,
    includeRetweets: false,
    pageDelayMs: 0,
    maxPages: undefined,
    defaultKeywords: [],
    defaultTimeRange: 'last-month',
  },

  embedding: {
    model: 'text-embedding-3-small',
    batchSize: 500,
    autoGenerate: true,
  },

  query: {
    defaultTopK: 5,
    defaultThreshold: 0.7,
    showSources: true,
  },

  output: {
    format: 'json',
    includeMetadata: true,
    timestampFormat: 'human',
  },

  ui: {
    showProgressBars: true,
    verboseLogging: false,
    colorOutput: true,
    confirmDestructiveActions: true,
  },

  advanced: {
    cacheEnabled: true,
    cacheTtlHours: 24,
    queryIdCacheMaxEntries: 200,
    queryIdCacheSnapshotEnabled: true,
    backupEnabled: true,
    maxBackupFiles: 5,
  },
};

/**
 * Configuration validation schema
 */
export const CONFIG_VALIDATION = {
  'scraping.rateLimitProfile': ['conservative', 'moderate', 'aggressive'],
  'scraping.maxTweets': { min: 1, max: 50000 },
  'scraping.pageDelayMs': { min: 0, max: 600000 },
  'scraping.maxPages': { min: 0, max: 10000 },
  'scraping.defaultTimeRange': ['last-week', 'last-month', 'last-3-months', 'last-6-months', 'last-year', 'lifetime'],
  'embedding.model': ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  'embedding.batchSize': { min: 1, max: 2000 },
  'query.defaultTopK': { min: 1, max: 50 },
  'query.defaultThreshold': { min: 0, max: 1 },
  'output.format': ['json', 'jsonl', 'csv', 'markdown', 'txt'],
  'output.timestampFormat': ['iso', 'relative', 'human'],
  'advanced.cacheTtlHours': { min: 1, max: 168 }, // 1 hour to 1 week
  'advanced.queryIdCacheMaxEntries': { min: 10, max: 2000 },
  'advanced.maxBackupFiles': { min: 1, max: 50 },
} as const;

/**
 * Configuration key paths for easy access
 */
export type ConfigKeyPath = 
  | 'api.openaiKey'
  | 'api.authToken'
  | 'api.ct0Token'
  | 'scraping.rateLimitProfile'
  | 'scraping.maxTweets'
  | 'scraping.includeReplies'
  | 'scraping.includeRetweets'
  | 'scraping.pageDelayMs'
  | 'scraping.maxPages'
  | 'scraping.defaultKeywords'
  | 'scraping.defaultTimeRange'
  | 'embedding.model'
  | 'embedding.batchSize'
  | 'embedding.autoGenerate'
  | 'query.defaultTopK'
  | 'query.defaultThreshold'
  | 'query.showSources'
  | 'output.format'
  | 'output.includeMetadata'
  | 'output.timestampFormat'
  | 'ui.showProgressBars'
  | 'ui.verboseLogging'
  | 'ui.colorOutput'
  | 'ui.confirmDestructiveActions'
  | 'advanced.databasePath'
  | 'advanced.cacheEnabled'
  | 'advanced.cacheTtlHours'
  | 'advanced.queryIdCacheMaxEntries'
  | 'advanced.queryIdCacheSnapshotEnabled'
  | 'advanced.backupEnabled'
  | 'advanced.maxBackupFiles';

/**
 * Human-readable descriptions for configuration keys
 */
export const CONFIG_DESCRIPTIONS: Record<ConfigKeyPath, string> = {
  'api.openaiKey': 'OpenAI API key for embeddings and Q&A',
  'api.authToken': 'X/Twitter auth token for scraping',
  'api.ct0Token': 'X/Twitter CT0 CSRF token for scraping',
  'scraping.rateLimitProfile': 'Rate limiting profile (conservative, moderate, aggressive)',
  'scraping.maxTweets': 'Default maximum number of tweets to scrape',
  'scraping.includeReplies': 'Include replies when scraping by default',
  'scraping.includeRetweets': 'Include retweets when scraping by default',
  'scraping.pageDelayMs': 'Delay in milliseconds between pagination pages',
  'scraping.maxPages': 'Maximum pagination pages to fetch (0 for no cap)',
  'scraping.defaultKeywords': 'Default keywords for filtering tweets',
  'scraping.defaultTimeRange': 'Default time range for scraping tweets',
  'embedding.model': 'OpenAI embedding model to use',
  'embedding.batchSize': 'Batch size for embedding generation',
  'embedding.autoGenerate': 'Automatically generate embeddings after scraping',
  'query.defaultTopK': 'Default number of results to return for queries',
  'query.defaultThreshold': 'Default similarity threshold for queries',
  'query.showSources': 'Show source tweets in query results',
  'output.format': 'Default output format for exports',
  'output.includeMetadata': 'Include metadata in output files',
  'output.timestampFormat': 'Format for displaying timestamps',
  'ui.showProgressBars': 'Show progress bars during operations',
  'ui.verboseLogging': 'Enable verbose logging output',
  'ui.colorOutput': 'Use colored output in terminal',
  'ui.confirmDestructiveActions': 'Confirm before destructive actions',
  'advanced.databasePath': 'Custom path for SQLite database file',
  'advanced.cacheEnabled': 'Enable caching for improved performance',
  'advanced.cacheTtlHours': 'Cache time-to-live in hours',
  'advanced.queryIdCacheMaxEntries': 'Maximum number of cached query IDs',
  'advanced.queryIdCacheSnapshotEnabled': 'Enable snapshot fallback for query IDs',
  'advanced.backupEnabled': 'Enable automatic database backups',
  'advanced.maxBackupFiles': 'Maximum number of backup files to keep',
};

/**
 * Configuration categories for organized display
 */
export const CONFIG_CATEGORIES = {
  'API Settings': [
    'api.openaiKey',
    'api.authToken',
    'api.ct0Token',
  ],
  'Scraping Defaults': [
    'scraping.rateLimitProfile',
    'scraping.maxTweets',
    'scraping.includeReplies',
    'scraping.includeRetweets',
    'scraping.pageDelayMs',
    'scraping.maxPages',
    'scraping.defaultKeywords',
    'scraping.defaultTimeRange',
  ],
  'Embedding Settings': [
    'embedding.model',
    'embedding.batchSize',
    'embedding.autoGenerate',
  ],
  'Query Settings': [
    'query.defaultTopK',
    'query.defaultThreshold',
    'query.showSources',
  ],
  'Output Settings': [
    'output.format',
    'output.includeMetadata',
    'output.timestampFormat',
  ],
  'UI Preferences': [
    'ui.showProgressBars',
    'ui.verboseLogging',
    'ui.colorOutput',
    'ui.confirmDestructiveActions',
  ],
  'Advanced Settings': [
    'advanced.databasePath',
    'advanced.cacheEnabled',
    'advanced.cacheTtlHours',
    'advanced.queryIdCacheMaxEntries',
    'advanced.queryIdCacheSnapshotEnabled',
    'advanced.backupEnabled',
    'advanced.maxBackupFiles',
  ],
} as const;
