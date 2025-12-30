# Topic-Based Tweet Search Command - Technical Specification

## Overview

Add a new `search` command to xgpt that finds tweets by topic/phrase using Twitter's search API. This enables discovering trending discussions, tracking tech movements, and finding content that isn't tied to specific accounts.

**Problem:** Valuable discussions happen across Twitter without centralized sources. We need to find tweets by searching phrases rather than scraping specific users.

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
| `--name <name>` | Save search as named topic (or reference existing) | - |
| `--max <number>` | Maximum tweets to collect | 500 |
| `--days <number>` | Limit to last N days | 7 |
| `--since <date>` | Start date (YYYY-MM-DD, local timezone) | - |
| `--until <date>` | End date (YYYY-MM-DD, local timezone) | - |
| `--mode <mode>` | Search mode: `latest` or `top` | latest |
| `--embed` | Auto-generate embeddings after search (session tweets only) | false |
| `--dry-run` | Show query and scope without executing | false |
| `--json` | Output results as JSON (for scripting) | false |
| `--resume <id>` | Resume interrupted search by session ID | - |
| `--cleanup` | Clean up old search sessions | false |
| `--older-than <duration>` | For cleanup: sessions older than (e.g., 30d) | - |

### Usage Examples

```bash
# Find AI startup discussions from last 7 days
xgpt search "building in public, indie hacker, shipped" --days 7

# Save as reusable topic
xgpt search "AGI, GPT-5, foundation models" --name "AI Trends" --days 7 --max 1000

# Re-run existing topic with new options
xgpt search "AGI, GPT-5" --name "AI Trends" --days 1

# Search with custom date range (local timezone)
xgpt search "YC demo day, fundraising" --since 2024-12-01 --until 2024-12-29

# Preview query without executing
xgpt search "rust lang, rustacean" --dry-run

# Search and auto-embed results
xgpt search "open source, oss maintainer" --mode top --embed

# Resume interrupted search
xgpt search --resume 42

# Machine-readable output for scripting
xgpt search "web3, crypto alpha" --days 7 --json

# Cleanup old sessions
xgpt search --cleanup --older-than 30d
```

---

## Design Decisions (Interview Results)

### Resumability & Error Handling
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search interruption | **Full resume support** | Store cursor in DB, allow `--resume <session-id>` |
| Cursor expiry | **No expiry** | Maximum flexibility for users |
| Rate limit behavior | **Auto-wait + retry** | Hands-off experience; waits for reset then continues |
| Individual tweet errors | **Skip and continue** | Log error, continue with remaining tweets |
| Unavailable tweets | **Skip silently** | Don't store, don't count in stats |
| Error messages | **Generic** | Show Twitter's error messages as-is |

### Data Model
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Variant matching (multi-match) | **First match wins** | Record only first/longest matching variant per tweet |
| Cross-search duplicates | **First origin only** | Only record the first search that found a tweet |
| User profile data | **Basic profile** | Handle, display name, bio, follower count from tweet metadata |
| Duplicate stats meaning | **Pre-existing only** | `duplicates_skipped` = tweets already in DB before this search |
| Auto-split tracking | **Single merged session** | Splits are implementation detail; one session with aggregate stats |
| Session audit | **Full integration** | Create session record, link to search_sessions |

### Topic Management
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Topic mutability | **Immutable variants** | Create new topic if variants change; maintains data lineage |
| Flag naming | **--name for both** | `--name` creates OR references existing topic by name |
| Name conflict | **Error** | "Topic already exists. Use --name to search with it, or choose a different name." |
| Topic option memory | **No memory** | Always use command defaults; user must specify options each time |

### Query Building
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Variant parsing | **Simple comma split** | Just split on commas; users quote the whole argument if needed |
| Query length limits | **Auto-split** | Automatically split into multiple sequential searches, merge results |
| Split variant ordering | **Preserve order** | Keep user's original ordering across splits |
| Quote tweets | **Include** | Quote tweets often have valuable commentary |
| Timezone handling | **Local timezone** | Interpret dates in user's system timezone, convert to UTC for Twitter |
| Date conflict (--days + --since/--until) | **Error** | Reject with clear error message explaining the conflict |
| Date filtering method | **Query only** | Trust Twitter's date operators; don't post-filter |

### User Experience
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Progress display | **Live counter** | Updating line: "Searching... 127/500 tweets (23 new, 14 duplicates)" |
| Update frequency | **Every tweet** | Immediate feedback on each tweet processed |
| Result output | **Stats summary** | Counts only: "47 new tweets, 12 duplicates, 8 users created" |
| Empty results | **Helpful message** | "No tweets found. Try broader variants or different date range." + suggestions |
| Topic rerun syntax | **Full command** | `xgpt search --name "AI Trends"` to re-run with saved variants |
| Ad-hoc search history | **Fire and forget** | Logged but not easily queryable |
| Dry-run support | **Yes** | `--dry-run` shows query, variant count, date range, then exits |
| JSON output | **Yes** | `--json` outputs structured JSON for scripting |
| Resume syntax | **Session ID only** | `--resume 123` - explicit session ID required |
| Stdin support | **No** | Variants must be provided as command argument |

### Rate Limiting & Safety
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rate limit pool | **Shared with scrape** | Search and scrape share limits for consistency |
| Anti-detection delays | **Use library's rate limiter** | Leverage twitter-scraper's built-in rate limit manager |
| Safety documentation | **Add warnings** | Warnings about rate limits, account risks, best practices |

### Embedding Integration
| Decision | Choice | Rationale |
|----------|--------|-----------|
| --embed scope | **Session only** | Only embed tweets collected in this search session |
| Empty embed (no new tweets) | **Skip silently** | Don't run embed if session collected 0 new tweets |

### Validation & Cleanup
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Input validation | **Minimal** | At least 1 variant, max tweets > 0 |
| Cleanup granularity | **Age-based only** | `--older-than 30d` is the only option |

---

## Technical Design

### Twitter Search API

The `@the-convocation/twitter-scraper` library provides:

```typescript
scraper.searchTweets(query: string, maxTweets: number, searchMode: SearchMode)
```

**SearchMode options:**
- `SearchMode.Latest` - Most recent tweets (default, best for tracking trends)
- `SearchMode.Top` - Popular/trending tweets

**Query syntax:**
- `"phrase"` - Exact match
- `OR` - Combine terms
- `since:YYYY-MM-DD` / `until:YYYY-MM-DD` - Date filtering (UTC)
- `-filter:retweets` - Exclude retweets (quote tweets included)

**Example built query:**
```
"AGI" OR "GPT-5" OR "foundation models" since:2024-12-22 -filter:retweets
```

### Query Auto-Splitting

Twitter has a ~500 character query limit. When exceeded:

1. Calculate variants that fit within limit
2. Preserve user's original variant ordering
3. Execute multiple sequential searches
4. Merge results into single session
5. Deduplicate across splits

```typescript
function splitQuery(variants: string[], maxLength: number = 450): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const variant of variants) {
    const addition = `"${variant}" OR `.length;
    if (currentLength + addition > maxLength && current.length > 0) {
      groups.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(variant);
    currentLength += addition;
  }

  if (current.length > 0) groups.push(current);
  return groups;
}
```

---

## Database Schema

### New Tables

#### 1. `search_topics` - Saved search configurations

```sql
CREATE TABLE search_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- "AI Trends"
  variants TEXT NOT NULL,              -- JSON: ["AGI", "GPT-5", "foundation models"]
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
  session_id INTEGER REFERENCES sessions(id),  -- Link to audit sessions table

  -- Configuration
  query TEXT NOT NULL,                 -- Full Twitter query sent
  variants TEXT NOT NULL,              -- JSON array of variants
  search_mode TEXT DEFAULT 'Latest',   -- 'Latest' | 'Top'
  max_tweets INTEGER NOT NULL,
  date_start INTEGER,                  -- Timestamp (UTC)
  date_end INTEGER,                    -- Timestamp (UTC)

  -- Resume support
  cursor TEXT,                         -- Twitter pagination cursor for resume
  last_tweet_id TEXT,                  -- Last processed tweet ID

  -- Results
  tweets_collected INTEGER DEFAULT 0,
  total_processed INTEGER DEFAULT 0,
  date_filtered INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,  -- Pre-existing duplicates only
  users_created INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'pending',       -- pending | running | paused | completed | failed
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_message TEXT,
  embeddings_generated INTEGER DEFAULT 0  -- Boolean: 0 or 1
);
```

#### 3. `tweet_search_origins` - Links tweets to searches (first origin only)

```sql
CREATE TABLE tweet_search_origins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL UNIQUE REFERENCES tweets(id) ON DELETE CASCADE,  -- UNIQUE enforces first-origin-only
  search_session_id INTEGER NOT NULL REFERENCES search_sessions(id),
  matched_variant TEXT NOT NULL,       -- Which variant matched this tweet
  found_at INTEGER NOT NULL
);

-- Indexes
CREATE UNIQUE INDEX idx_origins_tweet ON tweet_search_origins(tweet_id);
CREATE INDEX idx_origins_session ON tweet_search_origins(search_session_id);
CREATE INDEX idx_origins_variant ON tweet_search_origins(matched_variant);
```

### Schema TypeScript (Drizzle)

```typescript
// src/database/schema.ts - additions

export const searchTopics = sqliteTable("search_topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  variants: text("variants", { mode: "json" }).notNull().$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  lastSearched: integer("last_searched", { mode: "timestamp" }),
  totalTweetsFound: integer("total_tweets_found").default(0)
});

export const searchSessions = sqliteTable("search_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").references(() => searchTopics.id),
  sessionId: integer("session_id").references(() => sessionsTable.id),
  query: text("query").notNull(),
  variants: text("variants", { mode: "json" }).notNull().$type<string[]>(),
  searchMode: text("search_mode").notNull().default("Latest"),
  maxTweets: integer("max_tweets").notNull(),
  dateStart: integer("date_start", { mode: "timestamp" }),
  dateEnd: integer("date_end", { mode: "timestamp" }),
  cursor: text("cursor"),
  lastTweetId: text("last_tweet_id"),
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
  tweetId: text("tweet_id").notNull().unique().references(() => tweets.id, { onDelete: "cascade" }),
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
| `src/commands/search.ts` | Main search command implementation | 300 |
| `src/utils/searchUtils.ts` | Query building, variant parsing, date handling | 120 |

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
 * "AGI, GPT-5, foundation models" => ["AGI", "GPT-5", "foundation models"]
 */
export function parseSearchVariants(input: string): string[] {
  return input.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

/**
 * Build Twitter search query
 * ["AGI", "GPT-5"] + 7 days => "\"AGI\" OR \"GPT-5\" since:2024-12-22 -filter:retweets"
 */
export function buildTwitterQuery(
  variants: string[],
  dateRange?: { start: Date; end: Date }
): string {
  const quoted = variants.map(v => `"${v}"`);
  let query = quoted.join(' OR ');

  if (dateRange) {
    // Convert local dates to UTC for Twitter
    query += ` since:${formatDateUTC(dateRange.start)} until:${formatDateUTC(dateRange.end)}`;
  }

  query += ' -filter:retweets';
  return query;
}

/**
 * Calculate date range from options (local timezone)
 */
export function calculateDateRange(
  days?: number,
  since?: string,
  until?: string
): { start: Date; end: Date } | null {
  if (days !== undefined && (since || until)) {
    throw new Error('Cannot use --days with --since/--until. Choose one date method.');
  }

  if (days !== undefined) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
  }

  if (since || until) {
    const start = since ? parseLocalDate(since) : new Date(0);
    const end = until ? parseLocalDate(until) : new Date();
    return { start, end };
  }

  return null;
}

/**
 * Determine which variant matched a tweet (first/longest match wins)
 */
export function matchVariant(text: string, variants: string[]): string | null {
  const lower = text.toLowerCase();
  // Sort by length descending - longer = more specific
  const sorted = [...variants].sort((a, b) => b.length - a.length);
  return sorted.find(v => lower.includes(v.toLowerCase())) || null;
}

/**
 * Format date for Twitter (UTC)
 */
function formatDateUTC(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse date string as local timezone
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}
```

### 2. Query Functions (`src/database/queries.ts`)

```typescript
export const searchQueries = {
  // Topics
  async createTopic(name: string, variants: string[]): Promise<SearchTopic> {
    const existing = await this.getTopicByName(name);
    if (existing) {
      throw new Error(`Topic "${name}" already exists. Use --name to search with it, or choose a different name.`);
    }
    // Insert and return
  },

  async getTopicByName(name: string): Promise<SearchTopic | null>,
  async getAllTopics(): Promise<SearchTopic[]>,
  async updateTopicStats(id: number, tweetsFound: number): Promise<void>,

  // Sessions
  async createSession(data: NewSearchSession): Promise<SearchSession>,
  async updateSession(id: number, updates: Partial<SearchSession>): Promise<void>,
  async getSessionById(id: number): Promise<SearchSession | null>,
  async getPausedSessions(): Promise<SearchSession[]>,
  async cleanupOldSessions(olderThanDays: number): Promise<number>,

  // Resume support
  async saveCursor(sessionId: number, cursor: string, lastTweetId: string): Promise<void>,
  async getCursor(sessionId: number): Promise<{ cursor: string; lastTweetId: string } | null>,

  // Origins (first-origin-only via UNIQUE constraint)
  async recordTweetOrigin(data: NewTweetSearchOrigin): Promise<boolean> {
    // Returns false if origin already exists (duplicate)
    try {
      await db.insert(tweetSearchOrigins).values(data);
      return true;
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
      throw e;
    }
  },

  async getTweetsBySession(sessionId: number): Promise<string[]>,
  async getVariantBreakdown(sessionId: number): Promise<Record<string, number>>
};
```

### 3. Search Command Flow (`src/commands/search.ts`)

```typescript
export interface SearchOptions {
  query?: string;
  name?: string;
  maxTweets: number;
  days?: number;
  since?: string;
  until?: string;
  mode: 'latest' | 'top';
  embed: boolean;
  dryRun: boolean;
  json: boolean;
  resume?: number;
  cleanup?: boolean;
  olderThan?: string;
}

export async function searchCommand(options: SearchOptions): Promise<CommandResult> {
  // Handle cleanup mode
  if (options.cleanup) {
    return handleCleanup(options.olderThan);
  }

  // Handle resume mode
  if (options.resume) {
    return resumeSearch(options.resume);
  }

  // Validate input
  if (!options.query) {
    return { success: false, message: 'Search query required' };
  }

  // 1. Parse input
  const variants = parseSearchVariants(options.query);
  if (variants.length === 0) {
    return { success: false, message: 'At least one search variant required' };
  }
  if (options.maxTweets <= 0) {
    return { success: false, message: 'Max tweets must be greater than 0' };
  }

  const dateRange = calculateDateRange(options.days, options.since, options.until);

  // 2. Handle query splitting if needed
  const queryGroups = splitQuery(variants);
  const twitterQueries = queryGroups.map(group => buildTwitterQuery(group, dateRange));

  // 3. Dry run mode
  if (options.dryRun) {
    return handleDryRun(variants, twitterQueries, dateRange, options);
  }

  // 4. Handle named topic
  let topic: SearchTopic | null = null;
  if (options.name) {
    topic = await searchQueries.getTopicByName(options.name);
    if (!topic) {
      topic = await searchQueries.createTopic(options.name, variants);
    }
  }

  // 5. Create audit session
  const auditSession = await createSession('search', { variants, topic: options.name });

  // 6. Create search session
  const session = await searchQueries.createSession({
    topicId: topic?.id,
    sessionId: auditSession.id,
    query: twitterQueries.join(' | '),
    variants,
    searchMode: options.mode === 'top' ? 'Top' : 'Latest',
    maxTweets: options.maxTweets,
    dateStart: dateRange?.start,
    dateEnd: dateRange?.end,
    status: 'running'
  });

  // 7. Execute search
  const stats = await executeSearch(session, twitterQueries, variants, options);

  // 8. Handle embedding
  if (options.embed && stats.tweetsCollected > 0) {
    await embedSessionTweets(session.id);
    stats.embeddingsGenerated = true;
  }

  // 9. Update session
  await searchQueries.updateSession(session.id, {
    ...stats,
    status: 'completed',
    completedAt: new Date()
  });

  // 10. Update topic stats
  if (topic) {
    await searchQueries.updateTopicStats(topic.id, stats.tweetsCollected);
  }

  // 11. Return results
  return formatResults(stats, options.json);
}

async function executeSearch(
  session: SearchSession,
  queries: string[],
  variants: string[],
  options: SearchOptions
): Promise<SearchStats> {
  const stats: SearchStats = {
    tweetsCollected: 0,
    totalProcessed: 0,
    duplicatesSkipped: 0,
    usersCreated: 0
  };

  const scraper = await getScraper();
  const searchMode = options.mode === 'top' ? SearchMode.Top : SearchMode.Latest;
  const maxPerQuery = Math.ceil(options.maxTweets / queries.length);

  for (const query of queries) {
    try {
      for await (const tweet of scraper.searchTweets(query, maxPerQuery, searchMode)) {
        stats.totalProcessed++;

        // Update live counter (every tweet)
        updateProgress(stats, options.maxTweets);

        // Skip unavailable tweets silently
        if (!tweet.id || !tweet.text) continue;

        // Check for duplicate (pre-existing only)
        const exists = await tweetQueries.tweetExists(tweet.id);
        if (exists) {
          stats.duplicatesSkipped++;
          continue;
        }

        // Create user if needed (basic profile from tweet metadata)
        const user = await userQueries.upsertUser({
          username: tweet.username,
          name: tweet.name,
          bio: tweet.userBio,
          followersCount: tweet.userFollowers
        });
        if (user.created) stats.usersCreated++;

        // Save tweet
        await tweetQueries.insertTweet({
          id: tweet.id,
          userId: user.id,
          text: tweet.text,
          createdAt: tweet.timeParsed,
          // ... other fields
        });

        // Record origin (first-origin-only via UNIQUE constraint)
        const matchedVariant = matchVariant(tweet.text, variants) || variants[0];
        await searchQueries.recordTweetOrigin({
          tweetId: tweet.id,
          searchSessionId: session.id,
          matchedVariant
        });

        stats.tweetsCollected++;

        // Save cursor periodically for resume support (no expiry)
        if (stats.totalProcessed % 50 === 0) {
          await searchQueries.saveCursor(session.id, tweet.cursor, tweet.id);
        }

        // Check if we've hit max
        if (stats.tweetsCollected >= options.maxTweets) break;
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        // Auto-wait for rate limit reset
        console.log('\nRate limited. Waiting for reset...');
        await waitForRateLimitReset(error);
        continue; // Retry this query
      }
      // Skip and continue on other errors
      console.error(`\nError processing tweet: ${error.message}`);
      continue;
    }
  }

  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(80) + '\r');

  return stats;
}

function updateProgress(stats: SearchStats, max: number): void {
  const line = `Searching... ${stats.totalProcessed}/${max} tweets (${stats.tweetsCollected} new, ${stats.duplicatesSkipped} duplicates)`;
  process.stdout.write(`\r${line}`);
}

function formatResults(stats: SearchStats, asJson: boolean): CommandResult {
  if (asJson) {
    return {
      success: true,
      data: stats
    };
  }

  if (stats.tweetsCollected === 0 && stats.totalProcessed === 0) {
    return {
      success: true,
      message: 'No tweets found. Try broader variants or different date range.\n\nSuggestions:\n- Add more variant spellings\n- Extend the date range with --days\n- Try --mode top for popular tweets'
    };
  }

  return {
    success: true,
    message: `Search complete: ${stats.tweetsCollected} new tweets, ${stats.duplicatesSkipped} duplicates, ${stats.usersCreated} users created`
  };
}

function handleDryRun(
  variants: string[],
  queries: string[],
  dateRange: DateRange | null,
  options: SearchOptions
): CommandResult {
  const totalQueryLength = queries.reduce((sum, q) => sum + q.length, 0);

  let output = `Dry Run - Query Preview\n\n`;
  output += `Variants (${variants.length}): ${variants.map(v => `"${v}"`).join(', ')}\n`;

  if (dateRange) {
    output += `Date range: ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()} (local time)\n`;
  }

  output += `Search mode: ${options.mode === 'top' ? 'Top' : 'Latest'}\n`;
  output += `Max tweets: ${options.maxTweets}\n\n`;

  if (queries.length > 1) {
    output += `Twitter queries (${queries.length} splits due to length):\n`;
    queries.forEach((q, i) => {
      output += `  ${i + 1}. ${q}\n`;
    });
  } else {
    output += `Twitter query:\n${queries[0]}\n`;
  }

  output += `\nTotal query length: ${totalQueryLength}/500 characters`;

  return { success: true, message: output };
}

async function handleCleanup(olderThan?: string): Promise<CommandResult> {
  if (!olderThan) {
    return { success: false, message: 'Please specify --older-than (e.g., --older-than 30d)' };
  }

  const days = parseInt(olderThan.replace('d', ''));
  if (isNaN(days) || days <= 0) {
    return { success: false, message: 'Invalid duration. Use format like "30d" for 30 days.' };
  }

  const deleted = await searchQueries.cleanupOldSessions(days);
  return { success: true, message: `Deleted ${deleted} search sessions older than ${days} days` };
}

async function resumeSearch(sessionId: number): Promise<CommandResult> {
  const session = await searchQueries.getSessionById(sessionId);
  if (!session) {
    return { success: false, message: `Search session ${sessionId} not found` };
  }

  if (session.status === 'completed') {
    return { success: false, message: `Search session ${sessionId} is already completed` };
  }

  const cursorData = await searchQueries.getCursor(sessionId);
  if (!cursorData) {
    return { success: false, message: `No cursor saved for session ${sessionId}. Cannot resume.` };
  }

  // Mark session as running again
  await searchQueries.updateSession(sessionId, { status: 'running' });

  // Reconstruct options from session
  const variants = session.variants as string[];
  const dateRange = session.dateStart && session.dateEnd
    ? { start: session.dateStart, end: session.dateEnd }
    : null;

  // Rebuild query groups (same logic as initial search)
  const queryGroups = splitQuery(variants);
  const twitterQueries = queryGroups.map(group => buildTwitterQuery(group, dateRange));

  // Initialize stats from existing session data
  const stats: SearchStats = {
    tweetsCollected: session.tweetsCollected || 0,
    totalProcessed: session.totalProcessed || 0,
    duplicatesSkipped: session.duplicatesSkipped || 0,
    usersCreated: session.usersCreated || 0
  };

  const scraper = await getScraper();
  const searchMode = session.searchMode === 'Top' ? SearchMode.Top : SearchMode.Latest;
  const maxPerQuery = Math.ceil(session.maxTweets / twitterQueries.length);
  const remainingTweets = session.maxTweets - stats.tweetsCollected;

  console.log(`Resuming search session ${sessionId}...`);
  console.log(`Progress: ${stats.tweetsCollected}/${session.maxTweets} tweets collected`);

  // Resume from cursor position
  for (const query of twitterQueries) {
    try {
      // Pass cursor to resume from last position
      const tweetIterator = scraper.searchTweets(query, remainingTweets, searchMode);

      for await (const tweet of tweetIterator) {
        // Skip tweets we've already processed (before cursor)
        if (tweet.id && tweet.id <= cursorData.lastTweetId) {
          continue;
        }

        stats.totalProcessed++;
        updateProgress(stats, session.maxTweets);

        // Skip unavailable tweets silently
        if (!tweet.id || !tweet.text) continue;

        // Check for duplicate (pre-existing only)
        const exists = await tweetQueries.tweetExists(tweet.id);
        if (exists) {
          stats.duplicatesSkipped++;
          continue;
        }

        // Create user if needed
        const user = await userQueries.upsertUser({
          username: tweet.username,
          name: tweet.name,
          bio: tweet.userBio,
          followersCount: tweet.userFollowers
        });
        if (user.created) stats.usersCreated++;

        // Save tweet
        await tweetQueries.insertTweet({
          id: tweet.id,
          userId: user.id,
          text: tweet.text,
          createdAt: tweet.timeParsed,
        });

        // Record origin
        const matchedVariant = matchVariant(tweet.text, variants) || variants[0];
        await searchQueries.recordTweetOrigin({
          tweetId: tweet.id,
          searchSessionId: sessionId,
          matchedVariant
        });

        stats.tweetsCollected++;

        // Save cursor periodically
        if (stats.totalProcessed % 50 === 0) {
          await searchQueries.saveCursor(sessionId, tweet.cursor || '', tweet.id);
        }

        if (stats.tweetsCollected >= session.maxTweets) break;
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        console.log('\nRate limited. Waiting for reset...');
        await waitForRateLimitReset(error);
        continue;
      }
      console.error(`\nError processing tweet: ${error.message}`);
      continue;
    }
  }

  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(80) + '\r');

  // Update session with final results
  await searchQueries.updateSession(sessionId, {
    ...stats,
    status: 'completed',
    completedAt: new Date()
  });

  return {
    success: true,
    message: `Resume complete: ${stats.tweetsCollected} total tweets, ${stats.usersCreated} users created`
  };
}
```

### 4. CLI Registration (`src/cli.ts`)

```typescript
program
  .command('search')
  .description('Search for tweets by topic or phrase')
  .argument('[query]', 'Comma-separated search terms (e.g., "AGI, GPT-5")')
  .option('--name <name>', 'Save search as a named topic (or reference existing)')
  .option('--max <number>', 'Maximum tweets to search', '500')
  .option('--days <number>', 'Limit to tweets from last N days', '7')
  .option('--since <date>', 'Search since date (YYYY-MM-DD, local timezone)')
  .option('--until <date>', 'Search until date (YYYY-MM-DD, local timezone)')
  .option('--mode <mode>', 'Search mode: latest or top', 'latest')
  .option('--embed', 'Generate embeddings after search (session tweets only)', false)
  .option('--dry-run', 'Show query without executing', false)
  .option('--json', 'Output results as JSON', false)
  .option('--resume <id>', 'Resume interrupted search by session ID')
  .option('--cleanup', 'Clean up old search sessions')
  .option('--older-than <duration>', 'For cleanup: sessions older than (e.g., 30d)')
  .action(async (query, options) => {
    const result = await searchCommand({
      query,
      name: options.name,
      maxTweets: parseInt(options.max),
      days: options.days ? parseInt(options.days) : undefined,
      since: options.since,
      until: options.until,
      mode: options.mode,
      embed: options.embed,
      dryRun: options.dryRun,
      json: options.json,
      resume: options.resume ? parseInt(options.resume) : undefined,
      cleanup: options.cleanup,
      olderThan: options.olderThan
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!result.success) {
      console.error(`Error: ${result.message}`);
      process.exit(1);
    } else {
      console.log(result.message);
    }
  });
```

---

## Safety Documentation

Add to help text and README:

```
IMPORTANT: Twitter Account Safety

- Search operations count against your account's rate limits
- Excessive searching may trigger Twitter's anti-bot detection
- The scraper shares rate limits with the 'scrape' command
- If you hit rate limits, the search will auto-pause and resume

Best Practices:
- Start with --max 100 to test your queries
- Use --dry-run to preview queries before executing
- Avoid running multiple concurrent searches
- Space out large searches (1000+ tweets) by several hours
- Monitor for account warnings in Twitter's UI

If your account gets rate-limited:
- Searches will automatically wait and retry
- Use --resume <session-id> if you need to restart
- Wait at least 15 minutes before retrying manually
```

---

## Output Formats

### Default (Stats Summary)
```
Searching... 500/500 tweets (47 new, 453 duplicates)
Search complete: 47 new tweets, 453 duplicates, 8 users created
```

### Empty Results (Helpful Message)
```
No tweets found. Try broader variants or different date range.

Suggestions:
- Add more variant spellings
- Extend the date range with --days
- Try --mode top for popular tweets
```

### Dry Run
```
Dry Run - Query Preview

Variants (3): "AGI", "GPT-5", "foundation models"
Date range: 2024-12-22 to 2024-12-29 (local time)
Search mode: Latest
Max tweets: 500

Twitter query:
"AGI" OR "GPT-5" OR "foundation models" since:2024-12-22 until:2024-12-29 -filter:retweets

Total query length: 89/500 characters
```

### JSON Output
```json
{
  "success": true,
  "data": {
    "tweetsCollected": 47,
    "totalProcessed": 500,
    "duplicatesSkipped": 453,
    "usersCreated": 8,
    "embeddingsGenerated": false,
    "sessionId": 42
  }
}
```

---

## Implementation Checklist

- [ ] Add schema tables to `src/database/schema.ts`
  - [ ] searchTopics table
  - [ ] searchSessions table (with cursor field for resume)
  - [ ] tweetSearchOrigins table (with UNIQUE on tweet_id for first-origin-only)
  - [ ] Relations and types
- [ ] Add `searchQueries` to `src/database/queries.ts`
  - [ ] Topic CRUD (create with conflict error, get, list, update stats)
  - [ ] Session CRUD (create, update, get, cleanup by age)
  - [ ] Cursor save/load for resume (no expiry)
  - [ ] Origin recording (first-origin-only via UNIQUE constraint)
- [ ] Create `src/utils/searchUtils.ts`
  - [ ] parseSearchVariants (simple comma split)
  - [ ] buildTwitterQuery (include quote tweets)
  - [ ] calculateDateRange (local timezone, error on conflict)
  - [ ] matchVariant (longest first)
  - [ ] splitQuery (auto-split, preserve order)
- [ ] Create `src/commands/search.ts`
  - [ ] Main searchCommand function
  - [ ] executeSearch with live counter (every tweet)
  - [ ] Resume support (cursor storage, no expiry)
  - [ ] Dry-run mode
  - [ ] JSON output
  - [ ] Cleanup command (age-based only)
  - [ ] Error handling (skip and continue)
  - [ ] Rate limit auto-wait (using library's rate limiter)
  - [ ] Session-only embedding scope
- [ ] Add `SearchOptions` to `src/types/common.ts`
- [ ] Export from `src/commands/index.ts`
- [ ] Register command in `src/cli.ts`
- [ ] Add safety documentation to README
- [ ] Run database migration
- [ ] Test end-to-end flow
  - [ ] Basic search
  - [ ] Named topic creation (error on conflict)
  - [ ] Topic re-run (stateless, no option memory)
  - [ ] Date filtering (local timezone)
  - [ ] Date conflict error (--days + --since/--until)
  - [ ] Resume after interrupt
  - [ ] Dry-run mode
  - [ ] JSON output
  - [ ] Session cleanup
  - [ ] Auto-split on long queries (preserve order)
  - [ ] Rate limit handling (auto-wait)
  - [ ] Empty results (helpful message)

---

## Future Enhancements (Out of Scope)

1. **`xgpt topics` command** - List/view saved topics
2. **Scheduled searches** - Re-run saved topics periodically
3. **Job-specific presets** - Built-in variant sets
4. **Export results** - CSV/JSON export of search results
5. **Filter by engagement** - `--min-likes 10` to find viral posts
6. **Interactive topic selection** - Prompt to choose from existing topics
