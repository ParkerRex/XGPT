# Refactoring Opportunities

Comprehensive list of improvements and refactoring opportunities for the XGPT codebase.

## Priority Ranking

- **P0** - Critical, do first
- **P1** - High value, do soon
- **P2** - Medium value, when time permits
- **P3** - Nice to have

---

## Architecture & Structure

### 1. ~~Consolidate duplicate code in server.ts~~ [P1] DONE
**Problem:** The `formatNumber` helper is defined 3 times (dashboard, discover API, jobs API).
**Solution:** Extract to `src/utils/format.ts` and import everywhere.
**Files:** `src/server.ts`, `src/utils/format.ts`
**Status:** Completed in commit a3e4669. Created `src/utils/format.ts` with `formatNumber()` and `formatDuration()`.

### 2. ~~Split server.ts into modules~~ [P0] DONE
**Problem:** At 900+ lines, server.ts is doing too much - routes, templates, API handlers all in one file.
**Solution:** Split into:
```
src/server/
├── index.ts              # Main server setup
├── routes/
│   ├── pages.ts          # HTML page routes
│   └── api.ts            # API endpoints
├── templates/
│   ├── layout.ts         # Base HTML layout
│   └── components.ts     # Reusable HTML components
└── middleware/
    └── auth.ts           # Future auth middleware
```
**Files:** `src/server.ts`
**Status:** Completed in commit a3e4669. Original 995-line file now 18-line re-export.

### 3. ~~Create a proper UI component system~~ [P2] DONE
**Problem:** HTML templates are inline strings with lots of duplication (cards, forms, tables).
**Solution:** Create template functions:
```typescript
const card = (title: string, content: string) => `<div class="card"><h2>${title}</h2>${content}</div>`;
const table = (headers: string[], rows: string[][]) => `...`;
```
**Files:** `src/server/templates/components.ts`
**Status:** Completed in commit a3e4669. Created card, statCard, result, formGroup, table, tweetItem, profileItem, userRow, jobItem components.

### 4. ~~Unify command result handling~~ [P1] DONE
**Problem:** Each command handles success/error slightly differently. CLI and server have different error handling.
**Solution:** Create `CommandRunner` wrapper that standardizes execution, logging, and error handling.
**Files:** `src/commands/*.ts`, new `src/commands/runner.ts`
**Status:** Completed in commit a3e4669. Created runCommand, createCommand, runBatch, runWithRetry utilities.

---

## Database & Data

### 5. ~~Add proper database migrations runner~~ [P1] DONE
**Problem:** Using `drizzle-kit generate` but migrations are applied manually with `sqlite3`. No programmatic runner.
**Solution:** Already handled by Drizzle ORM's `migrate()` function in `connection.ts`.
**Status:** Already implemented. Migrations run automatically via `bun run src/cli.ts db --init`.

### 6. ~~Index the bio column for search~~ [P2] DONE
**Problem:** Now storing bios but can't search them efficiently.
**Solution:** Added indexes on bio, location, verified status, and deletedAt columns.
**Files:** `src/database/schema.ts`, migration `0004_polite_night_thrasher.sql`
**Status:** Completed in commit cbf426c.

### 7. ~~Add user-tweet relationship integrity~~ [P2] DONE
**Problem:** Some tweets from search reference users not in users table. Foreign key could fail.
**Solution:** Made `userId` nullable on tweets table so search results don't require user records.
**Files:** `src/database/schema.ts`
**Status:** Completed in commit cbf426c.

### 8. ~~Implement soft deletes~~ [P3] DONE
**Problem:** `DELETE` is permanent. No recovery option.
**Solution:** Added `deletedAt` columns to users and tweets. All queries filter out soft-deleted records. Added `softDeleteUser()`, `restoreUser()`, `softDeleteTweet()`, `restoreTweet()` methods.
**Files:** `src/database/schema.ts`, `src/database/queries.ts`
**Status:** Completed in commit cbf426c.

### 9. ~~Add pagination to queries~~ [P0] DONE
**Problem:** `getAllUsers()` returns everything. Will break with thousands of users.
**Solution:** Added `PaginationOptions` and `PaginatedResult<T>` types. `getAllUsers()` now returns paginated results with `{ data, total, limit, offset, hasMore }`. Added `getAllUsersSimple()` for backwards compatibility.
**Files:** `src/database/queries.ts`, `src/types/common.ts`
**Status:** Completed in commit cbf426c.

---

## Job System

### 10. Make job tracker persistent [P1]
**Problem:** Jobs are in-memory only. Lost on server restart.
**Solution:** Store jobs in SQLite `jobs` table. Load active jobs on startup.
**Files:** `src/jobs/tracker.ts`, `src/database/schema.ts`

### 11. Add job cancellation [P2]
**Problem:** No way to stop a running job from the UI.
**Solution:**
- Add `AbortController` to job context
- Add cancel button in taskbar
- Add `/api/jobs/:id/cancel` endpoint
**Files:** `src/jobs/tracker.ts`, `src/server.ts`, `src/commands/*.ts`

### 12. Integrate job tracking with all commands [P0]
**Problem:** Only discover uses job tracker. Scrape, search, embed don't show in taskbar.
**Solution:** Add `jobTracker.createJob()` to all long-running API endpoints.
**Files:** `src/server.ts` (scrape, search, embed endpoints)

### 13. ~~Add WebSocket/SSE for real-time updates~~ [P2] DONE
**Problem:** Polling every 2s is wasteful and has latency.
**Solution:** Use Server-Sent Events (simpler than WebSocket):
```typescript
app.get('/api/jobs/stream', ({ set }) => {
  set.headers['content-type'] = 'text/event-stream';
  // Stream job updates
});
```
**Files:** `src/server/routes/api.ts`, `src/server/templates/layout.ts`
**Status:** Completed. Added `/api/jobs/stream` SSE endpoint that streams job updates in real-time. Frontend now uses HTMX SSE extension (`sse-connect`, `sse-swap`) instead of polling. Includes heartbeat every 30s to keep connection alive.

---

## Error Handling

### 14. ~~Standardize error responses~~ [P1] DONE
**Problem:** API endpoints return different error formats. Some return HTML, some return objects.
**Solution:** Created `ApiError` class with HTTP status codes, factory methods (`ApiErrors.badRequest()`, etc.), and `toApiError()` converter. Added `handleApiError()` and `handleCommandError()` helpers to API routes for consistent error handling.
**Files:** `src/errors/api.ts`, `src/server/routes/api.ts`
**Status:** Completed. All API endpoints now use standardized error handling with proper HTTP status codes.

### 15. Add retry logic to Twitter API calls [P1]
**Problem:** Currently fails on first error. Transient network issues cause failures.
**Solution:** Add exponential backoff wrapper:
```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T>
```
**Files:** `src/utils/retry.ts`, `src/commands/scrape.ts`, `src/commands/users.ts`

### 16. Better error messages in UI [P2]
**Problem:** Errors show raw messages like "ECONNREFUSED". Not user-friendly.
**Solution:** Map error codes to friendly messages with suggested actions.
**Files:** `src/errors/messages.ts`, `src/server.ts`

---

## Type Safety

### 17. Remove `any` types [P1]
**Problem:** Several places use `any`:
- `src/server.ts` - job tracker, user queries
- `src/jobs/tracker.ts` - metadata
**Solution:** Add proper types. Use `unknown` with type guards where needed.
**Files:** `src/server.ts`, `src/jobs/tracker.ts`

### 18. Create shared types between CLI and server [P2]
**Problem:** Duplicate type definitions for API responses.
**Solution:** Create `src/types/api.ts` with shared request/response types.
**Files:** `src/types/api.ts`, `src/server.ts`, `src/commands/*.ts`

### 19. Add Zod validation for CLI input [P3]
**Problem:** CLI args aren't validated beyond Commander's basic checks.
**Solution:** Add Zod schemas for complex inputs (date ranges, keywords).
**Files:** `src/cli.ts`, new `src/validation/schemas.ts`

---

## Testing

### 20. Add integration tests for web UI [P1]
**Problem:** No tests for server routes or API endpoints.
**Solution:** Add tests using Elysia's test utilities:
```typescript
const app = createServer(0);
const response = await app.handle(new Request('/api/jobs'));
```
**Files:** `tests/integration/server.test.ts`

### 21. Add E2E tests with Playwright [P2]
**Problem:** No tests for full UI flows.
**Solution:** Add Playwright tests for:
- Dashboard loads with stats
- Discover search works
- Job taskbar appears
**Files:** `tests/e2e/*.spec.ts`, `playwright.config.ts`

### 22. Mock Twitter API for tests [P1]
**Problem:** Tests either hit real API (slow, flaky) or skip Twitter functionality.
**Solution:** Create mock scraper:
```typescript
class MockScraper {
  async *searchProfiles(query: string) {
    yield mockProfile1;
    yield mockProfile2;
  }
}
```
**Files:** `tests/mocks/scraper.ts`, `tests/unit/commands/*.test.ts`

---

## Performance

### 23. Add caching layer [P2]
**Problem:** Repeated queries for same data (stats, user lookups).
**Solution:** Add simple TTL cache:
```typescript
const cache = new Map<string, { data: any; expires: number }>();
```
**Files:** `src/utils/cache.ts`, `src/database/queries.ts`

### 24. Lazy load embeddings [P1]
**Problem:** `askCommand` loads all embeddings into memory for cosine similarity search.
**Solution:**
- Stream embeddings in batches
- Or use SQLite vector extension (sqlite-vss)
- Or pre-compute and store similarity scores
**Files:** `src/commands/ask.ts`

### 25. Batch database inserts [P2]
**Problem:** Some places insert records one-by-one in loops.
**Solution:** Collect records and use batch insert:
```typescript
await db.insert(tweets).values(tweetBatch);
```
**Files:** `src/commands/scrape.ts`, `src/commands/search.ts`

### 26. Add connection pooling [P3]
**Problem:** Single SQLite connection for all requests.
**Solution:** Use better-sqlite3's connection pool or Drizzle's pool support.
**Files:** `src/database/connection.ts`

---

## Features

### 27. Add user authentication to web UI [P2]
**Problem:** Web UI is open to anyone on the network.
**Solution:** Add basic auth or session-based auth:
```typescript
app.use(basicAuth({ username: 'admin', password: process.env.ADMIN_PASSWORD }));
```
**Files:** `src/server.ts`, `.env`

### 28. Add export functionality [P2]
**Problem:** No way to export data from UI.
**Solution:** Add export buttons:
- `/api/export/users?format=csv`
- `/api/export/tweets?format=json`
**Files:** `src/server.ts`, new `src/utils/export.ts`

### 29. Add bulk operations [P3]
**Problem:** Can only scrape one user, search one query at a time.
**Solution:** Add bulk endpoints:
- `POST /api/scrape/bulk` with array of usernames
- Queue system for processing
**Files:** `src/server.ts`, `src/jobs/queue.ts`

### 30. Add scheduling [P3]
**Problem:** No way to schedule recurring scrapes.
**Solution:** Add cron-like scheduler:
- Store schedules in database
- Run scheduler on server startup
- Use node-cron or similar
**Files:** `src/scheduler/index.ts`, `src/database/schema.ts`

### 31. Add webhooks/notifications [P3]
**Problem:** No way to get notified when jobs complete.
**Solution:**
- Add webhook URLs to config
- POST to webhook on job completion
- Optional: Discord/Slack integration
**Files:** `src/config/schema.ts`, `src/jobs/tracker.ts`

---

## Code Quality

### 32. Extract Twitter client setup [P0]
**Problem:** Cookie/scraper initialization duplicated across commands (scrape.ts, search.ts, users.ts).
**Solution:** Create singleton:
```typescript
// src/twitter/client.ts
export async function getTwitterClient(): Promise<Scraper> {
  // Initialize once, reuse
}
```
**Files:** `src/twitter/client.ts`, `src/commands/*.ts`

### 33. Add logging system [P1]
**Problem:** Using `console.log` everywhere. No log levels, no structured output.
**Solution:** Add logger:
```typescript
const logger = createLogger({ level: process.env.LOG_LEVEL || 'info' });
logger.info('Starting scrape', { username, maxTweets });
```
**Files:** `src/utils/logger.ts`, all files using console.log

### 34. Add request ID tracking [P2]
**Problem:** Can't trace a request through logs.
**Solution:** Add middleware to generate request ID, pass through context.
**Files:** `src/server.ts`, `src/utils/logger.ts`

### 35. Consolidate config [P1]
**Problem:** Config spread across:
- `.env` (API keys, tokens)
- Config system (rate limits)
- Hardcoded values (ports, defaults)
**Solution:** Single config source with env override:
```typescript
const config = loadConfig(); // Merges .env, config file, defaults
```
**Files:** `src/config/index.ts`

---

## DevEx

### 36. Add hot reload for server [P2]
**Problem:** Need to restart server manually after code changes.
**Solution:** Use `bun --watch`:
```json
"dev": "bun --watch run src/cli.ts serve"
```
**Files:** `package.json`

### 37. Add OpenAPI spec [P3]
**Problem:** No API documentation.
**Solution:** Use Elysia's Swagger plugin:
```typescript
import { swagger } from '@elysiajs/swagger';
app.use(swagger());
```
**Files:** `src/server.ts`, `package.json`

### 38. Add health check endpoint [P1]
**Problem:** No endpoint for monitoring/load balancers.
**Solution:** Add `/api/health`:
```typescript
app.get('/api/health', () => ({
  status: 'ok',
  db: checkDatabaseHealth(),
  uptime: process.uptime()
}));
```
**Files:** `src/server.ts`

### 39. Dockerize [P2]
**Problem:** No containerization for deployment.
**Solution:** Add Docker setup:
```dockerfile
FROM oven/bun:1
COPY . .
RUN bun install
CMD ["bun", "run", "start"]
```
**Files:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`

---

## Implementation Order

### Phase 1 - Foundation (P0)
1. Split server.ts into modules
2. Extract Twitter client setup
3. Add pagination to queries
4. Integrate job tracking with all commands

### Phase 2 - Reliability (P1)
5. Add proper database migrations runner
6. Make job tracker persistent
7. Standardize error responses
8. Add retry logic to Twitter API calls
9. Add logging system
10. Remove `any` types
11. Add health check endpoint
12. Consolidate config
13. Unify command result handling
14. Consolidate duplicate code

### Phase 3 - Quality (P2)
15. Create UI component system
16. Add job cancellation
17. Add WebSocket/SSE for real-time
18. Better error messages in UI
19. Add caching layer
20. Lazy load embeddings
21. Add hot reload
22. Add user authentication
23. Add export functionality
24. Dockerize

### Phase 4 - Polish (P3)
25. Index bio for search
26. Implement soft deletes
27. Add Zod validation
28. Batch database inserts
29. Add bulk operations
30. Add scheduling
31. Add webhooks
32. Add OpenAPI spec
