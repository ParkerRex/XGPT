# Usage

## Web UI

The easiest way to use XGPT with a visual interface:

```bash
bun dev                       # Start at http://localhost:3002
xgpt serve --port 8080        # Custom port
```

The web UI provides:
- **Dashboard** - View stats, users table with bios, and quick actions
- **Scrape** - Enter username, set options, start scraping
- **Search** - Topic-based search with date filters and auto-embed option
- **Discover** - Find Twitter profiles by bio, name, or keywords
- **Ask** - Ask questions, see AI answers with relevant tweets and similarity scores
- **Config** - Edit all settings inline with auto-save
- **Job Taskbar** - Floating status bar shows active jobs with progress and duration

## Interactive Mode

The easiest way to get started:

```bash
xgpt interactive

# Or with a specific user
xgpt interactive elonmusk
```

Interactive mode guides you through:

1. User Selection - Enter Twitter username
2. Content Type - Choose tweets, replies, or both
3. Search Scope - All posts or keyword filtering
4. Time Range - Week, month, 3mo, 6mo, year, lifetime, or custom
5. Options - Max tweets, embeddings
6. Summary - Review configuration
7. Execution - Automated scraping and processing

## Direct Commands

### Scraping

```bash
# Basic scrape
xgpt scrape elonmusk

# With options
xgpt scrape ID_AA_Carmack --max 1000 --replies --retweets
```

### Embeddings

```bash
# Generate embeddings from scraped tweets
xgpt embed --model text-embedding-3-small --batch 500
```

### Question Answering

```bash
xgpt ask "What does this person think about AI?" --top 5
```

Example output:

```
Processing question: "What does this person think about UI design?"
Loading embeddings from database...
Found 3 tweet embeddings
Generating embedding for question...
Finding 5 most relevant tweets...

ANSWER:
The person believes that translucent UI design is generally a bad idea...

RELEVANT TWEETS:
1. [95.2%] @ID_AA_Carmack (2024-01-15): "Translucent UI is almost always a bad idea..."
2. [87.3%] @ID_AA_Carmack (2024-01-14): "Clear interfaces work better than fancy ones"
```

### Topic Search

Search for tweets by topic using Twitter's search API:

```bash
# Find AI startup discussions from last 7 days
xgpt search "building in public, indie hacker, shipped" --days 7

# Track trending tech topics
xgpt search "AGI, GPT-5, foundation models" --name "AI Trends" --max 1000

# Preview query without executing
xgpt search "rust lang, rustacean" --dry-run

# Search and auto-embed for semantic queries
xgpt search "YC demo day, fundraising" --mode top --embed

# Resume interrupted search
xgpt search --resume 42
```

### Composable Timeline Commands

Fetch smaller timelines for composition and scripting:

```bash
# Fetch a single tweet
xgpt read 1918410259571106051
xgpt read https://x.com/ID_AA_Carmack/status/1918410259571106051

# Fetch author thread for a tweet
xgpt thread 1918410259571106051 --max 200

# Fetch replies to a tweet (paginated)
xgpt replies 1918410259571106051 --max 200 --cursor <cursor>

# Fetch a user's timeline
xgpt user-tweets ID_AA_Carmack --max 200 --include-replies

# Fetch mentions for a user
xgpt mentions --user ID_AA_Carmack --max 200
```

Common flags:
- `--no-save` to skip database persistence
- `--json` for machine-readable output
- `--cursor`, `--max-pages`, `--all`, `--delay` for pagination control

### User Discovery

Find Twitter profiles by bio, name, or keywords:

```bash
# Find Google engineers
xgpt users discover "google engineer" --max 20 --save

# Find AI researchers
xgpt users discover "AI researcher" --max 50

# Output as JSON
xgpt users discover "indie hacker" --json
```

Discovered profiles can be saved to the database with `--save`, storing bio, location, follower counts, and verification status.

## Script-Friendly Output

Use script mode for stable JSON output suitable for automation:

```bash
xgpt search "AGI, GPT-5" --script
```

## Configuration

```bash
# List all settings
xgpt config list

# Set rate limit profile
xgpt config set scraping.rateLimitProfile moderate

# Get specific value
xgpt config get api.openaiKey
```

### Rate Limit Profiles

- `conservative` - 2 req/min (safest)
- `moderate` - 4 req/min (balanced)
- `aggressive` - 8 req/min (faster, higher risk)

## Filtering

- **Content filtering**: Tweets, replies, retweets
- **Keyword matching**: Case-insensitive, partial matching
- **Date filtering**: Custom date ranges
- **Duplicate detection**: Automatic deduplication
