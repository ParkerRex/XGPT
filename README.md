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
xgpt embed                    # Generate embeddings
xgpt ask "question"           # Semantic search + GPT answer
xgpt db --stats               # Database stats
xgpt config list              # Show config
```

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
