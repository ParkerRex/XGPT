# Usage

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
