# Job Tracking System

X-GPT includes a persistent job tracking system that monitors long-running operations, enables cancellation, and provides real-time progress updates via Server-Sent Events (SSE).

## Overview

The job system is located in `src/jobs/tracker.ts` and provides:

- **Persistent storage** - Jobs are stored in SQLite for crash recovery
- **Real-time updates** - SSE streaming for live progress in the web UI
- **Cancellation support** - AbortController-based job cancellation
- **Automatic cleanup** - Old jobs are cleaned up after 24 hours

## Job Lifecycle

```
Created --> Running --> Completed
                   \--> Failed
                   \--> Cancelled
```

Jobs transition through these states:

| Status | Description |
|--------|-------------|
| `running` | Job is currently executing |
| `completed` | Job finished successfully |
| `failed` | Job encountered an error |
| `cancelled` | Job was cancelled by user |

## Job Types

Supported job types correspond to long-running CLI commands:

| Type | Command | Description |
|------|---------|-------------|
| `scrape` | `xgpt scrape` | Tweet scraping from user profiles |
| `search` | `xgpt search` | Topic-based tweet search |
| `embed` | `xgpt embed` | Embedding generation |
| `discover` | `xgpt users discover` | User profile discovery |

## Using the Job Tracker

### Creating a Job

```typescript
import { jobTracker, type JobContext } from './jobs';

// Create a job and get context for progress updates
const jobContext: JobContext = await jobTracker.createJob('scrape', {
  username: 'elonmusk',
  maxTweets: 1000
});

// JobContext includes:
// - jobId: string - Unique job identifier
// - signal: AbortSignal - For cancellation support
// - isCancelled: () => boolean - Check cancellation status
// - updateProgress: (current, total, message) => Promise<void>
```

### Updating Progress

```typescript
// Update progress during execution
await jobContext.updateProgress(50, 1000, 'Fetching tweets...');
await jobContext.updateProgress(100, 1000, 'Processing batch 1...');

// Check for cancellation
if (jobContext.isCancelled()) {
  console.log('Job was cancelled');
  return;
}
```

### Completing a Job

```typescript
// Mark as successful
await jobTracker.completeJob(jobContext.jobId, true);

// Mark as failed with error message
await jobTracker.completeJob(jobContext.jobId, false, 'Connection timeout');
```

### Cancelling a Job

```typescript
// Cancel from web UI or API
const cancelled = await jobTracker.cancelJob(jobId);

// In the running job, check the signal:
if (jobContext.signal.aborted) {
  throw new Error('Job cancelled');
}
```

## Job Interface

```typescript
interface Job {
  id: string;                    // Unique identifier (e.g., 'scrape-1704067200000')
  type: 'scrape' | 'search' | 'embed' | 'discover';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  progress: {
    current: number;            // Current progress value
    total: number;              // Total expected (0 if unknown)
    message: string;            // Status message
  };
  metadata?: Record<string, unknown>;  // Job-specific data
  errorMessage?: string;        // Error message if failed
}

interface JobContext {
  jobId: string;
  signal: AbortSignal;
  isCancelled: () => boolean;
  updateProgress: (current: number, total: number, message: string) => Promise<void>;
}
```

## Integration with Commands

### Basic Integration

```typescript
export async function scrapeCommand(options: ScrapeOptions): Promise<CommandResult> {
  const jobContext = await jobTracker.createJob('scrape', {
    username: options.username,
    maxTweets: options.maxTweets
  });

  try {
    await jobContext.updateProgress(0, options.maxTweets, 'Starting...');

    for (let i = 0; i < batches.length; i++) {
      // Check for cancellation before each batch
      if (jobContext.isCancelled()) {
        return { success: false, message: 'Cancelled by user' };
      }

      await processBatch(batches[i]);
      await jobContext.updateProgress(
        (i + 1) * batchSize,
        totalTweets,
        `Processing batch ${i + 1}/${batches.length}`
      );
    }

    await jobTracker.completeJob(jobContext.jobId, true);
    return { success: true, message: 'Completed' };
  } catch (error) {
    await jobTracker.completeJob(jobContext.jobId, false, error.message);
    throw error;
  }
}
```

### With Command Runner

```typescript
import { runCommand } from './commands/runner';

const result = await runCommand(
  () => scrapeCommand(options),
  {
    name: 'scrape',
    trackAsJob: true,
    jobMetadata: { username: options.username }
  }
);
```

## Server-Side Events (SSE)

The web UI receives job updates via SSE at `/api/jobs/stream`:

```typescript
// Server-side (in api.ts)
app.get('/api/jobs/stream', ({ set }) => {
  set.headers['content-type'] = 'text/event-stream';

  const formatSseData = (html: string) => {
    const lines = html.split('\n').filter(line => line.trim());
    return lines.map(line => `data: ${line}`).join('\n');
  };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial state
      const initial = generateJobsHtml(jobTracker.getAllJobs());
      controller.enqueue(
        encoder.encode(`event: jobs\n${formatSseData(initial)}\n\n`)
      );

      // Subscribe to updates
      const unsubscribe = jobTracker.subscribe((jobs) => {
        const html = generateJobsHtml(jobs);
        controller.enqueue(
          encoder.encode(`event: jobs\n${formatSseData(html)}\n\n`)
        );
      });

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 30000);

      return () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
    }
  });

  return new Response(stream);
});
```

```javascript
// Client-side (in browser)
const eventSource = new EventSource('/api/jobs/stream');
eventSource.addEventListener('jobs', (event) => {
  document.getElementById('taskbar').innerHTML = event.data;
});
```

## API Endpoints

### Get All Jobs

```http
GET /api/jobs
```

Returns HTML for the job taskbar.

### Cancel a Job

```http
POST /api/jobs/:id/cancel
```

Cancels a running job. Returns 404 if job not found or already completed.

### Job Updates Stream

```http
GET /api/jobs/stream
```

Server-Sent Events stream for real-time updates.

## Database Persistence

Jobs are stored in the `jobs` table:

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  progress_message TEXT,
  metadata TEXT,           -- JSON
  error_message TEXT,
  started_at DATETIME NOT NULL,
  completed_at DATETIME
);
```

### Crash Recovery

On server startup, the job tracker:

1. Marks stale running jobs as failed (older than 1 hour)
2. Cleans up old completed jobs (older than 24 hours)
3. Loads recent jobs into memory

```typescript
// In server startup
await jobTracker.initialize();
```

## Job Taskbar UI

The web UI displays a floating taskbar showing active jobs:

```html
<!-- Taskbar component in layout.ts -->
<div id="taskbar" class="taskbar"
     hx-ext="sse"
     sse-connect="/api/jobs/stream"
     sse-swap="jobs">
  <!-- Job items rendered here -->
</div>
```

Each job shows:
- Job type icon/spinner
- Progress bar (when total is known)
- Status message
- Duration
- Cancel button (for running jobs)

## Subscription Pattern

External code can subscribe to job updates:

```typescript
// Subscribe to all job changes
const unsubscribe = jobTracker.subscribe((jobs: Job[]) => {
  console.log('Jobs updated:', jobs.length);
});

// Later, unsubscribe
unsubscribe();
```

## Best Practices

1. **Always complete jobs** - Use try/finally to ensure completion:
   ```typescript
   try {
     // ... job work
     await jobTracker.completeJob(id, true);
   } catch (error) {
     await jobTracker.completeJob(id, false, error.message);
     throw error;
   }
   ```

2. **Check cancellation frequently** - Especially in loops:
   ```typescript
   for (const item of items) {
     if (jobContext.isCancelled()) return;
     await processItem(item);
   }
   ```

3. **Provide meaningful progress messages**:
   ```typescript
   await jobContext.updateProgress(50, 100, 'Processing @username tweets...');
   ```

4. **Include relevant metadata** for debugging:
   ```typescript
   await jobTracker.createJob('search', {
     query: 'AI news',
     mode: 'latest',
     maxTweets: 500
   });
   ```

## Related Documentation

- [API Reference](./api-reference.md) - Job API endpoints
- [Server Architecture](./server.md) - SSE implementation
- [Commands](./commands.md) - Command runner integration
