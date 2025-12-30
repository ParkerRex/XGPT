# Utilities

X-GPT includes a comprehensive set of utility functions for common operations like retry logic, formatting, date handling, and search operations.

## Overview

Utilities are located in `src/utils/`:

```
src/utils/
  logger.ts       # Structured logging with levels and namespaces
  retry.ts        # Twitter API retry with error classification
  backoff.ts      # Exponential backoff strategies
  format.ts       # Number and duration formatting
  dateUtils.ts    # Date range calculations
  searchUtils.ts  # Semantic search operations
  math.ts         # Mathematical functions (cosine similarity)
  array.ts        # Array utilities (chunking)
```

## Logging System

### Overview

The logging system (`logger.ts`) provides structured logging with log levels, namespaces, and context support. It replaces raw `console.log` calls with a more powerful and configurable logging interface.

### Basic Usage

```typescript
import { logger, createLogger, loggers } from './utils/logger';

// Use the default logger
logger.info('Application started');
logger.error('Something went wrong', error);

// Use pre-configured module loggers
loggers.jobs.info('Job started', { jobId: '123' });
loggers.scrape.warn('Rate limit approaching');
loggers.api.error('Request failed', error, { endpoint: '/users' });

// Create a custom logger with namespace
const log = createLogger('mymodule');
log.info('Custom module initialized');
```

### Log Levels

Control verbosity via the `LOG_LEVEL` environment variable:

| Level | Value | Description |
|-------|-------|-------------|
| `debug` | 0 | Verbose debugging information |
| `info` | 1 | General information (default) |
| `warn` | 2 | Warning messages |
| `error` | 3 | Error messages only |
| `silent` | 4 | No output |

```bash
# Show all logs including debug
LOG_LEVEL=debug bun run src/cli.ts scrape elonmusk

# Show only warnings and errors
LOG_LEVEL=warn bun run src/cli.ts serve
```

### Logger Methods

```typescript
const log = createLogger('mymodule');

// Standard log levels
log.debug('Detailed debug info', { data });    // Only when LOG_LEVEL=debug
log.info('General information');               // Default level
log.warn('Warning message', { context });      // Yellow output
log.error('Error occurred', error, { ctx });   // Red output

// Convenience methods
log.success('Operation completed');            // [ok] prefix
log.status('sync', 'Syncing data...');         // [sync] prefix
log.data({ complex: 'object' });               // JSON formatted output
```

### Structured Context

Add context to log messages for better debugging:

```typescript
log.info('Processing user', { username: 'john', tweetCount: 150 });
// Output: [mymodule] Processing user username=john tweetCount=150

log.error('Failed to save', error, { userId: 123, operation: 'update' });
// Output: [mymodule] [error] Failed to save userId=123 operation=update
//            Error message here
```

### Pre-configured Loggers

The following loggers are pre-configured for common modules:

```typescript
import { loggers } from './utils/logger';

loggers.jobs      // Job tracking system
loggers.scrape    // Tweet scraping
loggers.search    // Search operations
loggers.discover  // User discovery
loggers.embed     // Embedding generation
loggers.ask       // Q&A operations
loggers.db        // Database operations
loggers.api       // API endpoints
loggers.config    // Configuration
loggers.rateLimit // Rate limiting
loggers.cli       // CLI operations
```

### Child Loggers

Create sub-loggers for specific operations:

```typescript
const log = createLogger('scrape');
const tweetLog = log.child('tweets');
const userLog = log.child('users');

tweetLog.info('Processing tweets');  // [scrape:tweets] Processing tweets
userLog.info('Updating user');       // [scrape:users] Updating user
```

### Logger Options

```typescript
interface LoggerOptions {
  level?: LogLevel;      // Override default level
  namespace?: string;    // Logger namespace
  timestamps?: boolean;  // Include timestamps in output
}

const log = createLogger({
  namespace: 'mymodule',
  level: 'debug',
  timestamps: true
});

log.info('With timestamp');
// Output: 14:30:45.123 [mymodule] With timestamp
```

## Retry System

### Twitter API Retry

The retry system (`retry.ts`) provides intelligent retry logic specifically designed for Twitter API operations.

```typescript
import { withTwitterRetry, TwitterRetryPresets } from './utils/retry';

const tweets = await withTwitterRetry(
  () => scraper.getTweets('elonmusk', 100),
  {
    preset: 'standard',
    operationName: 'Fetch tweets',
    callbacks: {
      onRetry: (attempt, delay, error) => {
        console.log(`Retry ${attempt} in ${delay}ms`);
      },
      onSuccess: () => console.log('Success!'),
      onFinalFailure: (error, attempts) => {
        console.error(`Failed after ${attempts} attempts`);
      }
    }
  }
);
```

### Retry Presets

| Preset | Max Attempts | Base Delay | Max Delay | Use Case |
|--------|-------------|------------|-----------|----------|
| `conservative` | 2 | 5s | 120s | Sensitive accounts |
| `standard` | 3 | 2s | 60s | Normal operations |
| `aggressive` | 5 | 1s | 30s | Important operations |
| `rateLimit` | 3 | 60s | 300s | Rate limit recovery |

### Error Classification

The system automatically classifies errors to determine retry behavior:

```typescript
import { classifyError, RetryableErrorType } from './utils/retry';

const classification = classifyError(error);
// Returns:
// {
//   type: RetryableErrorType.RATE_LIMIT,
//   shouldRetry: true,
//   suggestedDelay: 60000,
//   friendlyMessage: 'Rate limited by Twitter. Waiting before retry...'
// }
```

Error types:

| Type | Should Retry | Suggested Delay | Description |
|------|-------------|-----------------|-------------|
| `NETWORK` | Yes | 2s | Connection issues |
| `RATE_LIMIT` | Yes | 60s | Too many requests |
| `TEMPORARY` | Yes | 5s | Server errors (5xx) |
| `AUTHENTICATION` | No | - | Invalid credentials |
| `VALIDATION` | No | - | Invalid input |
| `UNKNOWN` | Yes | 3s | Unclassified errors |

### Smart Retry

For dynamic retry logic based on error type:

```typescript
import { withSmartRetry } from './utils/retry';

const result = await withSmartRetry(
  () => apiCall(),
  {
    maxAttempts: 5,
    operationName: 'API call'
  }
);
```

## Exponential Backoff

### Basic Backoff

```typescript
import { withExponentialBackoff } from './utils/backoff';

const result = await withExponentialBackoff(
  () => unreliableOperation(),
  {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterPercent: 25
  },
  (attempt, delay, error) => {
    console.log(`Attempt ${attempt} failed, retrying in ${delay}ms`);
  }
);
```

### Backoff Configuration

```typescript
interface BackoffConfig {
  maxAttempts: number;    // Maximum retry attempts
  baseDelayMs: number;    // Initial delay
  maxDelayMs: number;     // Maximum delay cap
  jitterPercent: number;  // Random jitter (0-100)
}
```

### Delay Formatting

```typescript
import { formatDelay } from './utils/backoff';

formatDelay(500);     // "500ms"
formatDelay(2000);    // "2s"
formatDelay(65000);   // "1m 5s"
formatDelay(3665000); // "1h 1m 5s"
```

## Formatting Utilities

### Number Formatting

```typescript
import { formatNumber } from './utils/format';

formatNumber(1234);        // "1,234"
formatNumber(1234567);     // "1.2M"
formatNumber(1234567890);  // "1.2B"
formatNumber(undefined);   // "-"
```

### Duration Formatting

```typescript
import { formatDuration } from './utils/format';

// From start date to now
formatDuration(new Date('2024-01-15T10:00:00'));  // "5m 30s"

// From start to end
formatDuration(startDate, endDate);  // "1h 23m"

// Edge cases
formatDuration(new Date());  // "0s"
```

## Date Utilities

### Time Range Calculations

```typescript
import {
  getDateRange,
  getRelativeDate,
  formatDateRange
} from './utils/dateUtils';

// Get date range for last N days/weeks/months
const range = getDateRange('7d');
// { start: Date 7 days ago, end: Date now }

const range2 = getDateRange('3m');
// { start: Date 3 months ago, end: Date now }

// Get relative date
const weekAgo = getRelativeDate(7, 'days');
const monthAgo = getRelativeDate(1, 'months');

// Format date range for display
formatDateRange(start, end);
// "Jan 1, 2024 - Jan 31, 2024"
```

### Date Parsing

```typescript
import { parseDate, isValidDate } from './utils/dateUtils';

const date = parseDate('2024-01-15');
const valid = isValidDate('2024-01-15'); // true
const invalid = isValidDate('invalid');  // false
```

## Search Utilities

### Cosine Similarity

```typescript
import { cosineSimilarity } from './utils/math';

const similarity = cosineSimilarity(embedding1, embedding2);
// Returns: number between -1 and 1
```

### Find Similar Tweets

```typescript
import { findSimilarTweets } from './utils/searchUtils';

const results = findSimilarTweets(
  questionEmbedding,
  tweetEmbeddings,
  { topK: 5, threshold: 0.7 }
);
// Returns: Array of { tweet, similarity } sorted by similarity
```

## Array Utilities

### Chunking

```typescript
import { chunk } from './utils/array';

const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const batches = chunk(items, 3);
// [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]
```

### Async Batch Processing

```typescript
import { processBatches } from './utils/array';

await processBatches(
  items,
  100, // batch size
  async (batch, index) => {
    console.log(`Processing batch ${index}`);
    await processItems(batch);
  }
);
```

## Rate Limit Utilities

### Rate Limit Profile

```typescript
import {
  getRateLimitProfile,
  getRecommendedMaxTweets,
  isRateLimitError
} from './rateLimit/config';

// Get profile by name
const profile = getRateLimitProfile('moderate');
// {
//   name: 'Moderate',
//   requestsPerMinute: 4,
//   requestsPerHour: 120,
//   minDelayMs: 15000,
//   maxDelayMs: 30000,
//   burstCapacity: 5,
//   riskLevel: 'medium'
// }

// Calculate recommended max tweets for time constraint
const maxTweets = getRecommendedMaxTweets(profile, 60); // 60 minutes
// Returns: 240 (capped at profile limit)

// Check if error is rate limit related
if (isRateLimitError(error)) {
  console.log('Rate limited, waiting...');
}
```

### Jitter and Backoff

```typescript
import { addJitter, calculateBackoffDelay } from './rateLimit/config';

// Add random jitter to delay
const delay = addJitter(5000, 25); // 25% jitter
// Returns: 3750-6250ms (random)

// Calculate exponential backoff
const backoff = calculateBackoffDelay(
  3,      // attempt number
  1000,   // base delay
  2,      // multiplier
  30000   // max delay
);
// Returns: 8000ms (1000 * 2^3, capped at 30000)
```

## Best Practices

1. **Use Twitter presets** for API operations:
   ```typescript
   await withTwitterRetry(operation, { preset: 'standard' });
   ```

2. **Classify errors** before deciding retry strategy:
   ```typescript
   const { shouldRetry } = classifyError(error);
   ```

3. **Add jitter** to prevent thundering herd:
   ```typescript
   const delay = addJitter(baseDelay, 25);
   ```

4. **Use formatters** for user-facing output:
   ```typescript
   log.info(`Processed ${formatNumber(count)} tweets`);
   ```

5. **Batch large operations**:
   ```typescript
   const batches = chunk(items, 100);
   for (const batch of batches) {
     await processBatch(batch);
   }
   ```

6. **Use structured logging** instead of console.log:
   ```typescript
   import { loggers } from './utils/logger';
   loggers.scrape.info('Processing', { username, count });
   ```

## Related Documentation

- [Error Handling](./errors.md) - Error classification integration
- [Rate Limiting](./architecture.md#rate-limiting) - Rate limit system
- [Commands](./commands.md) - Using utilities in commands
