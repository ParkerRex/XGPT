# Topic-Based Tweet Search Command

## Overview

Add a new `search` command to xgpt that finds tweets by topic/phrase using Twitter's search API. This enables discovering content that isn't tied to specific accounts.

**Problem:** Valuable discussions happen on Twitter that aren't tied to specific accounts - product launches, industry trends, tool recommendations. We need to find these tweets by searching phrases rather than scraping specific users.

**Solution:** New `search` command using twitter-scraper's `searchTweets()` API with support for variant terms, date filtering, and result tracking.

---

## User Interface

### Command Syntax

```bash
xgpt search "<variants>" [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--name <name>` | Save search as named topic for reuse | - |
| `--max <number>` | Maximum tweets to collect | 500 |
| `--days <number>` | Limit to last N days | 7 |
| `--since <date>` | Start date (YYYY-MM-DD) | - |
| `--until <date>` | End date (YYYY-MM-DD) | - |
| `--mode <mode>` | Search mode: `latest` or `top` | latest |
| `--embed` | Auto-generate embeddings after search | false |

### Usage Examples

```bash
# Find AI tool discussions from last 7 days
xgpt search "Claude, GPT-4, Gemini, LLM" --days 7

# Save as reusable topic
xgpt search "raised funding, announcing seed, series A" --name "Startup Funding" --days 7 --max 1000

# Search with custom date range
xgpt search "launched, just shipped, now live" --since 2024-12-01 --until 2024-12-29

# Search top tweets and auto-embed
xgpt search "typescript tips" --mode top --embed
```

---

## Technical Design

### Twitter Search API

The `@the-convocation/twitter-scraper` library provides:

```typescript
scraper.searchTweets(query: string, maxTweets: number, searchMode: SearchMode)
```

**SearchMode options:**
- `SearchMode.Latest` - Most recent tweets (default, best for tracking new discussions)
- `SearchMode.Top` - Popular/trending tweets

**Query syntax:**
- `"phrase"` - Exact match
- `OR` - Combine terms
- `since:YYYY-MM-DD` / `until:YYYY-MM-DD` - Date filtering
- `-filter:retweets` - Exclude retweets

**Example built query:**
```
"Claude" OR "GPT-4" OR "Gemini" OR "LLM" since:2024-12-22 -filter:retweets
```

---

## Database Schema

### New Tables

#### 1. `search_topics` - Saved search configurations

```sql
CREATE TABLE search_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- "AI Tools"
  variants TEXT NOT NULL,              -- JSON: ["Claude", "GPT-4", "Gemini"]
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_searched INTEGER,
  total_tweets_found INTEGER DEFAULT 0
);
```

#### 2. `search_sessions` - Individual search runs

```sql
CREATE TABLE search_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER REFERENCES search_topics(id),

  -- Configuration
  query TEXT NOT NULL,                 -- Full Twitter query sent
  variants TEXT NOT NULL,              -- JSON array of variants
  search_mode TEXT DEFAULT 'Latest',   -- 'Latest' | 'Top'
  max_tweets INTEGER NOT NULL,
  date_start INTEGER,
  date_end INTEGER,

  -- Results
  tweets_collected INTEGER DEFAULT 0,
  total_processed INTEGER DEFAULT 0,
  date_filtered INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  users_created INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'pending',       -- pending | running | completed | failed
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_message TEXT,
  embeddings_generated INTEGER DEFAULT 0
);
```

#### 3. `tweet_search_origins` - Links tweets to searches

```sql
CREATE TABLE tweet_search_origins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  search_session_id INTEGER NOT NULL REFERENCES search_sessions(id),
  matched_variant TEXT NOT NULL,       -- Which variant matched this tweet
  found_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX idx_origins_tweet ON tweet_search_origins(tweet_id);
CREATE INDEX idx_origins_session ON tweet_search_origins(search_session_id);
CREATE INDEX idx_origins_variant ON tweet_search_origins(matched_variant);
```

### Schema TypeScript (Drizzle)

```typescript
// src/database/schema.ts - additions

export const searchTopics = sqliteTable("search_topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  variants: text("variants", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  lastSearched: integer("last_searched", { mode: "timestamp" }),
  totalTweetsFound: integer("total_tweets_found").default(0)
});

export const searchSessions = sqliteTable("search_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").references(() => searchTopics.id),
  query: text("query").notNull(),
  variants: text("variants", { mode: "json" }).notNull(),
  searchMode: text("search_mode").notNull().default("Latest"),
  maxTweets: integer("max_tweets").notNull(),
  dateStart: integer("date_start", { mode: "timestamp" }),
  dateEnd: integer("date_end", { mode: "timestamp" }),
  tweetsCollected: integer("tweets_collected").default(0),
  totalProcessed: integer("total_processed").default(0),
  dateFiltered: integer("date_filtered").default(0),
  duplicatesSkipped: integer("duplicates_skipped").default(0),
  usersCreated: integer("users_created").default(0),
  status: text("status").notNull().default("pending"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
  embeddingsGenerated: integer("embeddings_generated", { mode: "boolean" }).default(false)
});

export const tweetSearchOrigins = sqliteTable("tweet_search_origins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tweetId: text("tweet_id").notNull().references(() => tweets.id, { onDelete: "cascade" }),
  searchSessionId: integer("search_session_id").notNull().references(() => searchSessions.id),
  matchedVariant: text("matched_variant").notNull(),
  foundAt: integer("found_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date())
});
```

---

## File Structure

### Files to Create

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/commands/search.ts` | Main search command implementation | 200 |
| `src/utils/searchUtils.ts` | Query building & variant parsing | 60 |

### Files to Modify

| File | Changes |
|------|---------|
| `src/database/schema.ts` | Add 3 new tables + relations + types |
| `src/database/queries.ts` | Add `searchQueries` object |
| `src/cli.ts` | Register search command |
| `src/commands/index.ts` | Export searchCommand |
| `src/types/common.ts` | Add SearchOptions interface |

---

## Implementation Details

### 1. Search Utilities (`src/utils/searchUtils.ts`)

```typescript
/**
 * Parse comma-separated variants
 * "Claude, GPT-4, Gemini" => ["Claude", "GPT-4", "Gemini"]
 */
export function parseSearchVariants(input: string): string[] {
  return input.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

/**
 * Build Twitter search query
 * ["Claude", "GPT-4"] + 7 days => "\"Claude\" OR \"GPT-4\" since:2024-12-22 -filter:retweets"
 */
export function buildTwitterQuery(
  variants: string[],
  dateRange?: { start: Date; end: Date }
): string {
  const quoted = variants.map(v => `"${v}"`);
  let query = quoted.join(' OR ');

  if (dateRange) {
    query += ` since:${formatDate(dateRange.start)} until:${formatDate(dateRange.end)}`;
  }

  query += ' -filter:retweets';
  return query;
}

/**
 * Determine which variant matched a tweet
 */
export function matchVariant(text: string, variants: string[]): string | null {
  const lower = text.toLowerCase();
  // Match longer variants first
  const sorted = [...variants].sort((a, b) => b.length - a.length);
  return sorted.find(v => lower.includes(v.toLowerCase())) || null;
}
```

### 2. Query Functions (`src/database/queries.ts`)

```typescript
export const searchQueries = {
  // Topics
  async upsertTopic(name: string, variants: string[]): Promise<SearchTopic>,
  async getTopicByName(name: string): Promise<SearchTopic | null>,
  async getAllTopics(): Promise<SearchTopic[]>,

  // Sessions
  async createSession(data: NewSearchSession): Promise<SearchSession>,
  async updateSessionStatus(id: number, status: string, results?: Partial<SearchSession>): Promise<void>,
  async linkSessionToTopic(sessionId: number, topicId: number): Promise<void>,
  async getRecentSearchSessions(limit?: number): Promise<SearchSession[]>,

  // Origins (tweet-to-search linking)
  async recordTweetOrigin(data: NewTweetSearchOrigin): Promise<void>,
  async getTweetsByTopic(topicId: number): Promise<Tweet[]>,
  async getTweetsByVariant(variant: string): Promise<Tweet[]>,
  async getVariantBreakdown(topicId: number): Promise<Record<string, number>>
};
```

### 3. Search Command Flow (`src/commands/search.ts`)

```typescript
export async function searchCommand(options: SearchOptions): Promise<CommandResult> {
  // 1. Parse input
  const variants = parseSearchVariants(options.query);
  const dateRange = calculateDateRange(options.days, options.since, options.until);
  const twitterQuery = buildTwitterQuery(variants, dateRange);

  // 2. Create session
  const session = await searchQueries.createSession({
    query: twitterQuery,
    variants: JSON.stringify(variants),
    searchMode: options.mode === 'top' ? 'Top' : 'Latest',
    maxTweets: options.maxTweets,
    dateStart: dateRange?.start,
    dateEnd: dateRange?.end,
    status: 'running'
  });

  // 3. Setup scraper
  const scraper = new Scraper({ ... });
  await scraper.setCookies(cookies);

  // 4. Search and process tweets
  const searchMode = options.mode === 'top' ? SearchMode.Top : SearchMode.Latest;
  for await (const tweet of scraper.searchTweets(twitterQuery, maxTweets, searchMode)) {
    // Skip if outside date range
    if (dateRange && !isWithinDateRange(tweet.timeParsed, dateRange)) continue;

    // Skip duplicates but still record origin
    if (await tweetQueries.tweetExists(tweet.id)) {
      await searchQueries.recordTweetOrigin({ tweetId: tweet.id, searchSessionId: session.id, ... });
      continue;
    }

    // Create user if needed
    const user = await userQueries.upsertUser(tweet.username, tweet.name);

    // Save tweet
    await tweetQueries.insertTweets([{ id: tweet.id, userId: user.id, ... }]);

    // Record search origin
    const matchedVariant = matchVariant(tweet.text, variants);
    await searchQueries.recordTweetOrigin({
      tweetId: tweet.id,
      searchSessionId: session.id,
      matchedVariant: matchedVariant || variants[0]
    });
  }

  // 5. Update session
  await searchQueries.updateSessionStatus(session.id, 'completed', { ... });

  // 6. Optional: generate embeddings
  if (options.embed) {
    await embedCommand({});
  }

  return { success: true, ... };
}
```

### 4. CLI Registration (`src/cli.ts`)

```typescript
program
  .command('search')
  .description('Search for tweets by topic or phrase')
  .argument('<query>', 'Comma-separated search terms (e.g., "Claude, GPT-4, Gemini")')
  .option('--name <name>', 'Save search as a named topic')
  .option('--max <number>', 'Maximum tweets to search', '500')
  .option('--days <number>', 'Limit to tweets from last N days', '7')
  .option('--since <date>', 'Search since date (YYYY-MM-DD)')
  .option('--until <date>', 'Search until date (YYYY-MM-DD)')
  .option('--mode <mode>', 'Search mode: latest or top', 'latest')
  .option('--embed', 'Generate embeddings after search', false)
  .action(async (query, options) => {
    const result = await searchCommand({
      query,
      topicName: options.name,
      maxTweets: parseInt(options.max),
      days: options.days ? parseInt(options.days) : undefined,
      sinceDate: options.since,
      untilDate: options.until,
      searchMode: options.mode,
      generateEmbeddings: options.embed
    });

    if (!result.success) {
      console.error(`Error: ${result.message}`);
      process.exit(1);
    }
  });
```

---

## Key Design Decisions

### 1. User Handling
Create user records on-the-fly for tweet authors discovered via search. Reuses existing `userQueries.upsertUser()`. This maintains referential integrity and allows future timeline scraping of interesting users.

### 2. Deduplication
- Check `tweetQueries.tweetExists()` before inserting
- Still record `tweetSearchOrigins` for duplicates (so you can see all searches that found a tweet)

### 3. Variant Tracking
Store `matchedVariant` on each origin record. Enables queries like "show me all tweets that matched 'GPT-4'" and variant breakdown analytics.

### 4. Integration with Existing Commands
- Tweets go into same `tweets` table
- `xgpt embed` automatically picks up new tweets without embeddings
- `xgpt ask` searches all embeddings including search-sourced tweets
- No changes needed to embed/ask commands

### 5. Twitter Query Building
- Wrap each variant in quotes for exact phrase matching
- Combine with OR
- Add `since:`/`until:` operators for date filtering
- Add `-filter:retweets` to exclude noise

---

## Future Enhancements

1. **`xgpt topics` command** - List/view saved topics
   ```bash
   xgpt topics list
   xgpt topics show "AI Tools" --by-variant
   ```

2. **Scheduled searches** - Re-run saved topics periodically

3. **Topic presets** - Built-in variant sets for common use cases
   ```bash
   xgpt search --preset ai-models --days 7
   ```

4. **Export results** - CSV/JSON export of search results

5. **Filter by engagement** - `--min-likes 10` to find viral discussions

---

## Implementation Checklist

- [ ] Add schema tables to `src/database/schema.ts`
- [ ] Add relations and types to schema
- [ ] Add `searchQueries` to `src/database/queries.ts`
- [ ] Create `src/utils/searchUtils.ts`
- [ ] Create `src/commands/search.ts`
- [ ] Add `SearchOptions` to `src/types/common.ts`
- [ ] Export from `src/commands/index.ts`
- [ ] Register command in `src/cli.ts`
- [ ] Run database migration
- [ ] Test end-to-end flow
