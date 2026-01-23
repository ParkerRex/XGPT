# Composable Timeline Commands

## Goal
Expose smaller, focused timeline commands that can be composed or pipelined while still integrating with the database, jobs, and output conventions.

## Background
A single large scrape flow is useful, but smaller commands (read, thread, replies, mentions) unlock more flexible workflows, easier scripting, and safer experimentation.

## User Stories
- As a power user, I want to fetch a thread or replies for a specific tweet without running a full scrape.
- As an automator, I want JSON output and cursors so I can pipeline results into other tools.
- As a cautious user, I want each command to honor rate limits and save results for later embedding.

## Scope
- CLI commands only (no required UI changes).
- Works with existing auth, rate limit, and output systems.
- Supports optional persistence and origin metadata tagging for later filtering.

## Command Set
### `xgpt read <tweet-id-or-url>`
- Fetch a single tweet by ID or URL.
- Output includes the tweet and any resolved author metadata.
- No pagination.

### `xgpt thread <tweet-id-or-url>`
- Fetch the author thread rooted at the given tweet.
- Returns the ordered chain for the author where possible.
- Optional flag to include adjacent replies by the same author if supported.

### `xgpt replies <tweet-id-or-url>`
- Fetch replies to the tweet (paginated).
- Exposes `nextCursor` and session metadata for resume.

### `xgpt user-tweets <username>`
- Fetch a user timeline for the given username.
- Supports `--include-replies`, `--include-retweets`, and date filtering where feasible.

### `xgpt mentions [--user <username>]`
- Fetch the mentions timeline for the active auth user by default.
- `--user` targets a specific username when supported by the underlying endpoint.

### Optional (phase 2)
- `xgpt likes <username>`
- `xgpt bookmarks`
- `xgpt list-timeline <list-id-or-url>`

## Shared CLI and Output
- All commands support output flags from the script-friendly output spec:
  - `--json`, `--plain`, `--no-color`
- Persistence flags:
  - `--save` (default) / `--no-save`
- Pagination flags (where applicable, aligned with the pagination-resume spec):
  - `--cursor <string>`, `--max-pages <n>`, `--all`, `--delay <ms>`
- Consistent JSON envelope:
  - `{ success, data, nextCursor?, error }`

## Behavior
- Accept both raw tweet IDs and full URLs; resolve to canonical ID.
- When `--no-save` is used, commands still return data but skip database writes.
- Deduplicate by tweet ID; report duplicates skipped in the response metadata.
- For paginated commands, stop when `--max-pages` is reached or no cursor remains.

## Data Model
- Reuse `tweets` table; store origin metadata in `tweets.metadata.origin`.
- Origin payload shape:
  - `{ command, input, cursor?, sessionId?, fetchedAt }`
- If a tweet already exists, append origin metadata if it is new.
- Optional: add a lightweight `timeline_sessions` table for cursor + progress tracking,
  or extend existing session tables if a shared model already exists.

## Integration Notes
- Use `runCommand` / `createCommand` for consistent execution and job tracking.
- Centralize ingestion + dedupe in `tweetQueries`.
- Respect `RateLimitManager` profiles and backoff behavior.
- Wire into query ID cache for endpoints that rely on GraphQL query IDs.

## Non-Goals
- Full parity with all X/Twitter endpoints.
- UI changes beyond optional new pages later.
- Replacing the existing `scrape` command.

## Acceptance Criteria
- Each command runs end-to-end and stores tweets by default.
- JSON output includes `items` and `nextCursor` for paginated commands.
- Duplicates are skipped and reported.
- `--no-save` executes without touching the database.

## Risks
- Endpoint availability and query IDs may change; use cache and clear errors.
- Mentions/bookmarks endpoints may require additional auth or permissions.

## Test Plan
- Unit tests for input parsing (ID vs URL) and origin metadata merging.
- Integration tests for `read`, `thread`, and `replies` with mocked scraper output.
- Manual smoke tests for `--json`, `--no-save`, and pagination flags.
