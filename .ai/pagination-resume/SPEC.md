# Pagination and Resume Ergonomics

## Goal
Make long runs restartable, controllable, and consistent across commands.

## Background
Search already supports resume, but other commands do not. A shared pagination contract improves UX and safety.

## User Stories
- As a user running long scrapes, I want the CLI to resume from where it left off after rate limits, network failures, or manual stops.
- As a power user, I want deterministic pagination controls (`--cursor`, `--max-pages`) so automation is reproducible.
- As a cautious user, I want to see progress and know exactly what will be resumed or skipped.

## Scope
- Commands that page through remote APIs (search, scrape/timeline, discover).
- CLI output (plain + `--json`) and session persistence for resume.
- Shared pagination utilities and database support for cursors.

## Requirements
- Shared flags for timeline and search commands:
  - `--all` (exhaust)
  - `--max-pages <n>`
  - `--cursor <string>`
  - `--delay <ms>`
- Store cursor and session metadata for resume.
- `--json` output includes `nextCursor` when available.

## CLI and Config
- Add `--resume <session-id>` to all commands that support pagination.
- Add optional `--fresh` to ignore stored cursor and start from scratch.
- Extend config defaults where useful:
  - `scraping.pageDelayMs` (default 0)
  - `scraping.maxPages` (optional)

## Behavior
- If `--all` is set, the command continues until no cursor remains.
- `--max-pages` caps the number of pages even if `--all` is set.
- `--delay` inserts a wait between pages.
- If both `--cursor` and `--resume` are provided, `--cursor` wins (explicit override).
- If `--resume` is set and no cursor is stored, the command fails with a clear error.
- If `--fresh` is set with `--resume`, ignore saved cursor but reuse session metadata.

## Pagination Contract
- Each page fetch returns `{ items, nextCursor? }`.
- A page is considered "consumed" only after items are persisted.
- Cursor persistence happens after each page (or every N items for streams).
- Resume must not reprocess items already stored.

## Session Metadata
Store per-session pagination state:
- `command` (search/scrape/discover)
- `query`/filters (stringified for replay)
- `startedAt`, `lastUpdatedAt`
- `pageCount`
- `lastItemId` (for APIs without cursor)
- `nextCursor` (nullable)

## Resume Semantics
- If `nextCursor` exists: resume from that cursor.
- If only `lastItemId` exists: resume by skipping items <= `lastItemId`.
- If neither exists: fail and suggest `--fresh` or rerun without resume.
- If `max` was set previously, resume only for remaining items.

## Output Contract
- Plain output includes:
  - Session id
  - Page count
  - Last cursor saved (redacted/shortened)
- `--json` includes:
  - `sessionId`
  - `pageCount`
  - `itemsCollected`
  - `nextCursor` (or `null`)
  - `lastItemId` (if applicable)

## Non-Goals
- Forcing pagination on commands that do not support cursors.
- Perfectly deterministic replay when remote ordering changes.

## Implementation Notes
- Add shared pagination helpers in `src/utils/pagination.ts`.
- Extend session tables to store cursors for scrape-like sessions.
- Add `--resume` support where feasible (scrape/discover).
- Use atomic cursor writes to avoid torn state.
- Centralize cursor saving in helpers to keep behavior consistent.

## Acceptance Criteria
- New flags work consistently across supported commands.
- Resume restarts from the last stored cursor without reprocessing.
- `--json` includes `nextCursor` when more data is available.
- `--resume` and `--fresh` behavior is deterministic and documented.
- Resume output clearly indicates what was resumed and from where.

## Risks
- Cursor invalidation; provide clear error and a `--fresh` retry hint.
- APIs without cursors may require `lastItemId` heuristics; document limitations.

## Test Plan
- Unit tests for pagination helper behavior (cursor, delay, max-pages).
- Integration tests for session cursor persistence and resume skipping.
- Manual smoke: interrupt a run mid-way, resume, and confirm no duplicates.
