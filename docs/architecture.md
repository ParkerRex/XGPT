# Architecture

## Data Flow

1. **Scraping**: Twitter/X -> SQLite (users/tweets tables)
2. **Embedding**: Tweets -> OpenAI API -> embeddings table
3. **Search**: Question -> embedding -> cosine similarity -> relevant tweets -> GPT answer

## Project Structure

```
xgpt/
├── src/
│   ├── cli.ts                 # Main CLI entry point
│   ├── server.ts              # Web UI server (Elysia + HTMX)
│   ├── commands/
│   │   ├── scrape.ts          # Tweet scraping
│   │   ├── search.ts          # Topic-based tweet search
│   │   ├── users.ts           # User discovery by bio/keywords
│   │   ├── embed.ts           # Embedding generation
│   │   ├── ask.ts             # Question answering
│   │   ├── config.ts          # Configuration management
│   │   ├── interactive.ts     # Interactive mode
│   │   └── index.ts           # Command exports
│   ├── database/
│   │   ├── connection.ts      # SQLite connection (WAL mode)
│   │   ├── schema.ts          # Drizzle ORM schema
│   │   ├── queries.ts         # Database queries
│   │   ├── migrate-json.ts    # JSON migration
│   │   └── optimization.ts    # Performance tools
│   ├── jobs/
│   │   ├── tracker.ts         # Job tracking for web UI taskbar
│   │   └── index.ts           # Exports
│   ├── config/
│   │   ├── manager.ts         # Config persistence
│   │   └── schema.ts          # Config schema
│   ├── errors/
│   │   ├── types.ts           # Error classes
│   │   ├── handler.ts         # Error handling
│   │   └── index.ts           # Exports
│   ├── rateLimit/
│   │   ├── manager.ts         # Token bucket algorithm
│   │   ├── config.ts          # Rate limit profiles
│   │   └── estimator.ts       # Time estimates
│   ├── prompts/
│   │   ├── contentType.ts     # Content type selection
│   │   ├── searchScope.ts     # Keyword filtering
│   │   └── timeRange.ts       # Date range selection
│   ├── ui/
│   │   ├── progress.ts        # Progress bars
│   │   ├── spinner.ts         # Loading spinners
│   │   └── status.ts          # Status lines
│   ├── types/
│   │   └── common.ts          # TypeScript types
│   └── utils/
│       ├── dateUtils.ts       # Date utilities
│       ├── array.ts           # Array chunking
│       └── math.ts            # Cosine similarity
├── scripts/
│   └── patch-twitter-scraper.ts  # Postinstall patch for profile search
├── data/
│   └── xgpt.db                # SQLite database
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## Dependencies

- **Runtime**: Bun
- **Database**: SQLite + Drizzle ORM
- **CLI**: Commander.js + @inquirer/prompts
- **Web UI**: Elysia + HTMX
- **AI**: OpenAI API (embeddings + chat)
- **Scraping**: @the-convocation/twitter-scraper (v0.21.0)

## Database Features

- **Soft Deletes**: Users and tweets have `deletedAt` columns. Deleted records are filtered out by default but can be restored.
- **Pagination**: `getAllUsers()` returns paginated results with `{ data, total, limit, offset, hasMore }`.
- **Indexes**: Optimized indexes on bio, location, verified status, and deletion timestamps for fast queries.
- **Nullable Foreign Keys**: Tweets can exist without user records (for search results).

## Rate Limiting

Two layers of rate limiting:

1. **Library level**: twitter-scraper's `WaitingRateLimitStrategy` handles Twitter API 429 responses
2. **Application level**: Custom token bucket with circuit breaker protects account from suspension

The application rate limiter integrates with the library's strategy - when Twitter returns a rate limit, both systems are notified.
