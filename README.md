# X-GPT

CLI tool for Twitter/X scraping and semantic search. Scrape tweets, generate embeddings, ask questions, discover users.

## Quick Start

```bash
bun install
cp .env.example .env  # Add OPENAI_KEY, AUTH_TOKEN, CT0
bun run src/cli.ts db --init
bun dev                       # Start web UI at localhost:3002
```

## Commands

```bash
# Development
bun dev                       # Start web UI at localhost:3002
bun cli                       # Run CLI directly

# Core Commands
xgpt interactive              # Guided setup
xgpt scrape <username>        # Scrape tweets from user
xgpt search "terms"           # Search tweets by topic/phrase
xgpt users discover "query"   # Find Twitter profiles by bio/name
xgpt embed                    # Generate embeddings
xgpt ask "question"           # Semantic search + GPT answer
xgpt serve                    # Start web UI
xgpt db --stats               # Database stats
xgpt config list              # Show config
```

## Web UI

Start a browser-based interface with all CLI functionality:

```bash
bun dev                       # http://localhost:3002
xgpt serve --port 8080        # Custom port
```

Features:
- **Dashboard** - Stats overview, quick actions
- **Scrape** - Scrape tweets from any user
- **Search** - Topic-based search with filters
- **Discover** - Find Twitter profiles by bio/keywords
- **Ask** - AI Q&A with relevant tweets
- **Config** - Edit settings inline
- **Job Taskbar** - Real-time progress for long operations

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

### Discover Command

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

## How It Works

1. Scrape tweets from Twitter/X using session cookies
2. Generate vector embeddings via OpenAI
3. Query with natural language - finds relevant tweets via cosine similarity, generates answer with GPT

## Documentation

### Getting Started
- [Setup](docs/setup.md) - Installation, cookies, environment variables
- [Usage](docs/usage.md) - Commands, filtering, configuration

### Architecture
- [Architecture](docs/architecture.md) - Project structure, data flow, dependencies
- [Database](docs/database.md) - Schema, migrations, optimization
- [Server](docs/server.md) - Web server architecture, routes, templates

### Core Systems
- [Error Handling](docs/errors.md) - Error categories, recovery suggestions, API errors
- [Job Tracking](docs/jobs.md) - Job lifecycle, cancellation, SSE updates
- [Commands](docs/commands.md) - Command runner pattern, execution flow
- [Validation](docs/validation.md) - Input validation with TypeBox

### Reference
- [API Reference](docs/api-reference.md) - REST API endpoints
- [Configuration](docs/configuration.md) - All config options and defaults
- [Components](docs/components.md) - UI component library
- [Utilities](docs/utilities.md) - Retry logic, formatting, helpers

### Development
- [Testing](docs/testing.md) - Unit, integration, and E2E testing

## Tech Stack

- Bun runtime
- SQLite + Drizzle ORM
- OpenAI API (embeddings + chat)
- [@the-convocation/twitter-scraper](https://github.com/the-convocation/twitter-scraper) v0.21.0
- Commander.js (CLI)
- Elysia + HTMX (Web UI)

## Development

```bash
bun dev               # Start web UI (localhost:3002)
bun cli               # Run CLI
bun test              # Run tests
bun run typecheck     # Type check
```

## License

MIT
