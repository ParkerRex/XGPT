# Opt-In Live Tests for Breakage Detection

## Goal
Detect X/Twitter breaking changes early without impacting default CI runs.

## Background
Live endpoints can change without notice. A gated live test suite provides early warning.

## User Stories
- As a maintainer, I want a fast, opt-in live test suite to catch breakages before users report them.
- As a CI owner, I want live tests to be skipped unless explicitly enabled.
- As a contributor, I want failures to explain how to fix auth or refresh query IDs.

## Scope
- Applies to live network tests only.
- Runs against the same auth resolution used by production commands.
- Keeps network usage minimal to reduce rate-limit risk.

## Requirements
- Add a live test suite gated by `XGPT_LIVE=1`.
- Provide `bun run test-live` that runs only live tests.
- Use conservative rate limits and small limits (max 1-5 items).
- Tests validate basic fields and schema shape, not full content.
- Live tests must never persist data by default.

## Behavior
- Live tests are skipped by default.
- Failures print suggested remediation (auth check, query-id refresh, retry with delay).
- When `XGPT_LIVE=1`, log a clear warning that network access will be used.

## Non-Goals
- No network calls in standard unit/integration test runs.
- No scraping of large volumes.

## Implementation Notes
- Add `tests/live/*.test.ts` with a shared helper for auth and rate limiting.
- Reuse existing commands or direct API calls with minimal surface area.
- Add `tests/live/_helpers.ts` to enforce small limits and optional dry-run.

## Acceptance Criteria
- `XGPT_LIVE=1 bun test` runs live tests.
- `bun run test-live` executes only live tests.
- Failures provide actionable hints.
- Live tests do not write to SQLite or files unless explicitly enabled.

## Risks
- Rate limiting or account flags; keep limits tiny and opt-in only.
- Auth or cookie extraction may be unavailable in CI; document required env/flags.

## Test Plan
- Unit test for gating logic (ensures tests are skipped when `XGPT_LIVE` is unset).
- Live smoke tests:
  - `auth check --validate` returns OK.
  - Minimal search returns at least one item or a clear “no results” response.
  - Minimal scrape of a known public user returns expected fields.
