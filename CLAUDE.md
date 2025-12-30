# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- **Test**: `bun test` or `bun run test-modules.ts` - Runs module verification tests
- **Build**: `bun build src/cli.ts --outdir ./dist --target bun`
- **Start**: `bun run src/cli.ts` (main CLI entry point)
- **Development**: `bun run src/cli.ts` (no separate dev mode)

### Testing Strategy
- **Quick verification**: `bun run test-modules.ts` - Tests core module loading and functionality
- **Full test suite**: `bun test` - Runs all tests including unit, integration, and e2e
- **Watch mode**: `bun test --watch`
- Always run `bun run test-modules.ts` after making changes to verify core functionality

### Database Commands
- **Initialize DB**: `bun run src/cli.ts db --init`
- **DB Health**: `bun run src/cli.ts db --health`
- **DB Stats**: `bun run src/cli.ts db --stats`
- **Database migrations**: Uses Drizzle Kit with schema in `src/database/schema.ts`

### Web UI
- **Start server**: `bun run src/cli.ts serve` (default port 3000)
- **Custom port**: `bun run src/cli.ts serve --port 8080`

## Architecture Overview

### CLI Framework
- **Entry Point**: `src/cli.ts` - Commander.js-based CLI with multiple commands
- **Commands**: Located in `src/commands/` - modular command structure
  - `interactive.ts` - Guided interactive mode for new users
  - `scrape.ts` - Tweet scraping with database integration
  - `embed.ts` - Vector embedding generation
  - `ask.ts` - AI-powered Q&A using semantic search
  - `config.ts` - Configuration management system

### Database Architecture
- **ORM**: Drizzle ORM with SQLite backend (`data/xgpt.db`)
- **Schema**: `src/database/schema.ts` - Users, tweets, embeddings, sessions tables
- **Performance**: 13 optimized indexes, WAL mode, 99.8/100 performance score
- **Migration**: JSON to SQLite migration system in `src/database/migrate-json.ts`
- **Optimization**: Performance tools in `src/database/optimization.ts`

### Core Data Flow
1. **Scraping**: Twitter/X → SQLite database (users/tweets tables)
2. **Embedding**: Database tweets → OpenAI embeddings → embeddings table
3. **Search**: User question → embedding → cosine similarity → relevant tweets → AI answer

### Key Systems
- **Rate Limiting**: `src/rateLimit/` - Token bucket algorithm with multiple profiles
- **Configuration**: `src/config/` - Persistent user preferences system
- **Error Handling**: `src/errors/` - Comprehensive error system with recovery suggestions
  - Automatic error categorization (auth, network, database, rate limit, etc.)
  - User-friendly messages with actionable recovery steps
  - Context-aware error tracking with metadata
- **Prompts**: `src/prompts/` - Interactive CLI prompts for user input

### Web UI
- **Server**: `src/server.ts` - Elysia-based web server with HTMX frontend
- **Routes**: Dashboard, Scrape, Search, Ask, Config pages
- **API**: REST endpoints at `/api/*` that call existing command functions
- **Frontend**: Inline HTML/CSS with HTMX for interactivity (no JS framework)

### Technology Stack
- **Runtime**: Bun (not Node.js) - see `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc`
- **Database**: SQLite with Drizzle ORM
- **CLI**: Commander.js with @inquirer/prompts
- **Web**: Elysia with HTMX
- **AI**: OpenAI API for embeddings and chat completion
- **Scraping**: @the-convocation/twitter-scraper

## Development Guidelines

### Bun-First Development
- Use `bun run` instead of `npm run`
- Use `bun test` instead of jest/vitest
- Use `bun install` instead of npm/yarn/pnpm
- Use `bun build` instead of webpack/vite
- Bun automatically loads .env files

### Database Patterns
- All database operations go through `src/database/queries.ts`
- Use Drizzle ORM syntax, not raw SQL
- Session tracking is built-in - use `sessionsTable` for audit trails
- Embeddings are stored as JSON arrays in the `vector` column

### Command Development
- Follow the pattern in existing commands (`src/commands/*.ts`)
- Export command functions from `src/commands/index.ts`
- Register new commands in `src/cli.ts`
- Use interactive prompts from `src/prompts/` for user input

### Error Handling
- Use the centralized error system from `src/errors/`
- Import error classes and `handleCommandError` function
- Provide context when throwing/handling errors:
  ```typescript
  return handleCommandError(error, {
    command: 'scrape',
    username,
    operation: 'tweet_scraping'
  });
  ```
- Error categories: Authentication, RateLimit, Database, Network, Validation, Configuration

### Configuration System
- User preferences are stored via `src/config/manager.ts`
- Schema defined in `src/config/schema.ts`
- Supports API keys, scraping preferences, embedding settings
- Use config system instead of hard-coding defaults

### Rate Limiting
- Always respect rate limits to protect user accounts
- Use `RateLimitManager` from `src/rateLimit/manager.ts`
- Handle rate limit errors with backoff strategies from `src/utils/backoff.ts`
- Three profiles: conservative (2 req/min), moderate (4 req/min), aggressive (8 req/min)

## Key File Locations
- **CLI Entry**: `src/cli.ts`
- **Web Server**: `src/server.ts`
- **Database Schema**: `src/database/schema.ts`
- **Database Queries**: `src/database/queries.ts`
- **Main Commands**: `src/commands/`
- **Configuration**: `src/config/`
- **Error Handling**: `src/errors/`
- **Rate Limiting**: `src/rateLimit/`
- **Type Definitions**: `src/types/`
- **Tests**: `tests/` directory with unit, integration, e2e tests