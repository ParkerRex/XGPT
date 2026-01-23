# Command Runner System

X-GPT provides a standardized command execution wrapper (`CommandRunner`) that ensures consistent execution, logging, error handling, and job tracking across all CLI commands.

## Overview

The command runner is located in `src/commands/runner.ts` and provides:

- **Standardized execution** - Consistent command lifecycle
- **Automatic error handling** - Errors are caught and converted to `CommandResult`
- **Job tracking integration** - Optional automatic job creation/completion
- **Duration tracking** - Execution time is measured
- **Retry support** - Built-in retry with configurable strategies
- **Batch execution** - Run multiple commands sequentially or in parallel

## CommandResult Interface

All commands return a `CommandResult`:

```typescript
interface CommandResult {
  success: boolean;
  message: string;
  error?: string;
  data?: Record<string, unknown>;
}

interface CommandRunnerResult extends CommandResult {
  duration?: number;  // Execution time in ms
  jobId?: string;     // Job ID if tracking enabled
}
```

## Basic Usage

### Simple Command Execution

```typescript
import { runCommand } from './commands/runner';

const result = await runCommand(
  async () => {
    // Your command logic here
    const tweets = await fetchTweets(username);
    return {
      success: true,
      message: `Fetched ${tweets.length} tweets`,
      data: { count: tweets.length }
    };
  },
  { name: 'fetch-tweets' }
);

console.log(`Completed in ${result.duration}ms`);
```

### With Job Tracking

```typescript
const result = await runCommand(
  async (jobId) => {
    // jobId is provided when trackAsJob is true
    if (jobId) {
      jobTracker.updateProgress(jobId, 0, 100, 'Starting...');
    }

    // Command logic...

    return { success: true, message: 'Done' };
  },
  {
    name: 'scrape',
    trackAsJob: true,
    jobMetadata: { username: 'elonmusk' }
  }
);

console.log(`Job ID: ${result.jobId}`);
```

### With Error Context

```typescript
const result = await runCommand(
  () => scrapeCommand(options),
  {
    name: 'scrape',
    context: {
      username: options.username,
      operation: 'tweet_scraping'
    },
    verbose: true
  }
);
```

## Configuration Options

```typescript
interface CommandRunnerOptions {
  name: string;                           // Command name for logging
  context?: Omit<ErrorContext, 'command'>; // Additional error context
  trackAsJob?: boolean;                   // Enable job tracking
  jobMetadata?: Record<string, unknown>;  // Job metadata (if tracking)
  verbose?: boolean;                      // Enable verbose logging
}
```

## Creating Reusable Commands

Use `createCommand` to wrap a handler with consistent options:

```typescript
import { createCommand } from './commands/runner';

const wrappedScrape = createCommand(
  'scrape',
  async (options: ScrapeOptions, jobId?: string) => {
    // Implementation
    return { success: true, message: 'Done', data: { tweets: 100 } };
  },
  { trackAsJob: true } // Default options
);

// Use the wrapped command
const result = await wrappedScrape(
  { username: 'elonmusk', maxTweets: 100 },
  { verbose: true } // Override options
);
```

## Batch Execution

### Sequential Execution

```typescript
import { runBatch } from './commands/runner';

const results = await runBatch([
  { fn: () => scrapeCommand(user1Options), options: { name: 'scrape-user1' } },
  { fn: () => scrapeCommand(user2Options), options: { name: 'scrape-user2' } },
], {
  parallel: false,
  stopOnError: true  // Stop if any command fails
});
```

### Parallel Execution

```typescript
const results = await runBatch([
  { fn: () => searchCommand(query1), options: { name: 'search-1' } },
  { fn: () => searchCommand(query2), options: { name: 'search-2' } },
], {
  parallel: true  // Run all commands simultaneously
});
```

## Retry Support

### Basic Retry

```typescript
import { runWithRetry } from './commands/runner';

const result = await runWithRetry(
  () => flakeyOperation(),
  {
    name: 'flakey-op',
    maxRetries: 3,
    retryDelayMs: 1000
  }
);
```

### Custom Retry Logic

```typescript
const result = await runWithRetry(
  () => apiCall(),
  {
    name: 'api-call',
    maxRetries: 5,
    retryDelayMs: 2000,
    shouldRetry: (error) => {
      // Only retry on network errors
      return error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
    }
  }
);
```

## Progress Updates

Use `updateJobProgress` helper for safe progress updates:

```typescript
import { updateJobProgress } from './commands/runner';

export async function myCommand(options, jobId?: string): Promise<CommandResult> {
  updateJobProgress(jobId, 0, 100, 'Starting...');

  for (let i = 0; i < 100; i++) {
    await processItem(i);
    updateJobProgress(jobId, i + 1, 100, `Processing item ${i + 1}`);
  }

  return { success: true, message: 'Completed' };
}
```

## Command Implementation Pattern

### Recommended Structure

```typescript
// src/commands/mycommand.ts
import type { CommandResult } from '../types/common';
import { handleCommandError } from '../errors';
import { updateJobProgress } from './runner';

export interface MyCommandOptions {
  input: string;
  verbose?: boolean;
}

export async function myCommand(
  options: MyCommandOptions,
  jobId?: string
): Promise<CommandResult> {
  try {
    // 1. Validate inputs
    if (!options.input) {
      return {
        success: false,
        message: 'Input is required',
        error: 'VALIDATION_ERROR'
      };
    }

    // 2. Update progress
    updateJobProgress(jobId, 0, 0, 'Initializing...');

    // 3. Perform operation
    const result = await doWork(options.input);

    updateJobProgress(jobId, 100, 100, 'Complete');

    // 4. Return success
    return {
      success: true,
      message: `Processed ${result.count} items`,
      data: { count: result.count }
    };
  } catch (error) {
    // 5. Handle errors with context
    return handleCommandError(error, {
      command: 'mycommand',
      operation: 'processing'
    });
  }
}
```

### Registering Commands

Commands are registered in `src/cli.ts`:

```typescript
import { myCommand } from './commands/mycommand';

program
  .command('mycommand <input>')
  .description('Do something with input')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (input, options) => {
    const result = await myCommand({ input, ...options });
    if (!result.success) {
      process.exit(1);
    }
  });
```

## Error Handling Flow

```
Command Execution
       |
       v
  Success? ----Yes----> Return CommandResult
       |
       No
       |
       v
  handleCommandError()
       |
       v
  Categorize Error (auth, network, rate limit, etc.)
       |
       v
  Enhance Message
       |
       v
  Return CommandResult with error details
```

## Logging Output

With `verbose: true`, the runner logs:

```
[scrape] Starting command execution...
[scrape] Command succeeded in 1234ms

// Or on failure:
[scrape] Command failed after 567ms
```

## Best Practices

1. **Always return CommandResult** - Never throw from command functions:
   ```typescript
   try {
     // ...
   } catch (error) {
     return handleCommandError(error, context);
   }
   ```

2. **Use descriptive names** - Command names appear in logs and job tracking:
   ```typescript
   { name: 'scrape-user-tweets' } // Good
   { name: 'cmd1' }                // Bad
   ```

3. **Track long operations as jobs**:
   ```typescript
   { trackAsJob: true } // For operations > 5 seconds
   ```

4. **Include relevant context**:
   ```typescript
   context: {
     username,
     operation: 'batch_processing',
     batchNumber: 3
   }
   ```

5. **Update progress frequently** for better UX:
   ```typescript
   // Every 10% or every significant step
   updateJobProgress(jobId, current, total, meaningfulMessage);
   ```

## Related Documentation

- [Error Handling](./errors.md) - Error types and handling
- [Job Tracking](./jobs.md) - Job system details
- [API Reference](./api-reference.md) - API command invocation
