# Database

X-GPT uses SQLite with Drizzle ORM for high-performance data storage.

## Commands

```bash
# View statistics
xgpt db --stats

# Check health
xgpt db --health

# Initialize/reset
xgpt db --init

# Optimize performance
xgpt optimize --metrics

# Run benchmarks
xgpt benchmark --report
```

## Migration

Migrate existing JSON data to SQLite:

```bash
xgpt migrate --tweets tweets.json --vectors vectors.json
```

## Schema

### Tables

- `users` - Twitter user profiles
- `tweets` - Scraped tweet content
- `embeddings` - Vector embeddings for semantic search
- `sessions` - Scraping session audit trail

### Performance

- 13 optimized indexes for common query patterns
- WAL mode for concurrent read/write
- 99.8/100 performance score
- Sub-millisecond query times

## File Location

Database is stored at `data/xgpt.db`. Backups are created automatically before migrations in `data/backups/`.
