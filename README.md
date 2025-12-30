# X-GPT

CLI tool for Twitter/X scraping and semantic search. Scrape tweets, generate embeddings, ask questions.

## Quick Start

```bash
bun install
cp .env.example .env  # Add OPENAI_KEY, AUTH_TOKEN, CT0
bun run src/cli.ts db --init
bun run src/cli.ts interactive
```

## Commands

```bash
xgpt interactive              # Guided setup
xgpt scrape <username>        # Scrape tweets
xgpt search "terms"           # Search tweets by topic/phrase
xgpt embed                    # Generate embeddings
xgpt ask "question"           # Semantic search + GPT answer
xgpt db --stats               # Database stats
xgpt config list              # Show config
```

### Search Command

Find tweets by topic using Twitter's search API:

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

## Twitter Account Safety

Search and scrape operations count against your account's rate limits. Excessive usage may trigger Twitter's anti-bot detection.

**Best Practices:**
- Start with `--max 100` to test queries
- Use `--dry-run` to preview before executing
- Avoid running multiple concurrent searches
- Space out large searches (1000+ tweets) by several hours

**Rate Limit Handling:**
- Searches automatically wait and retry when rate limited
- Use `--resume <session-id>` if you need to restart
- Wait at least 15 minutes before retrying manually

## How It Works

1. Scrape tweets from Twitter/X using session cookies
2. Generate vector embeddings via OpenAI
3. Query with natural language - finds relevant tweets via cosine similarity, generates answer with GPT

## Documentation

- [Setup](docs/setup.md) - Installation, cookies, environment
- [Usage](docs/usage.md) - Commands, filtering, configuration
- [Database](docs/database.md) - Schema, migrations, optimization
- [Architecture](docs/architecture.md) - Project structure, data flow
- [Testing](docs/testing.md) - Test commands

## Tech Stack

- Bun runtime
- SQLite + Drizzle ORM
- OpenAI API (embeddings + chat)
- [@the-convocation/twitter-scraper](https://github.com/the-convocation/twitter-scraper) v0.21.0
- Commander.js

## Development

```bash
bun test              # Run tests
bun run typecheck     # Type check
bun run src/cli.ts    # Run CLI
```

## License

MIT
