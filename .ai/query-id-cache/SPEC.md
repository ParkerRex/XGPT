# Query ID Cache and Auto-Recovery

## Goal
Reduce breakage when X/Twitter GraphQL query IDs rotate by caching, refreshing, and retrying automatically.

## Background
GraphQL query IDs change without notice, causing hard failures. A cache with TTL and a refresh path improves resilience.

## Requirements
- Ship a baseline query ID map in-repo.
- Maintain a user cache at `~/.xgpt/query-ids-cache.json` with a TTL (default 24h).
- On 404 or query-id error, refresh once and retry automatically.
- Provide `xgpt query-ids --fresh` to force refresh.

## CLI and Config
- `xgpt query-ids [--fresh] [--json]`
- Env overrides:
  - `XGPT_QUERY_ID_CACHE_PATH`
  - `XGPT_QUERY_ID_CACHE_TTL`

## Behavior
- Refresh uses a single discovery path; if it fails, fallback to baseline IDs.
- Auto-retry occurs once per request to avoid loops.

## Non-Goals
- Full scraping of site bundles beyond what is needed to refresh IDs.
- Automatic updates to the baseline map in-repo.

## Implementation Notes
- Add `src/twitter/queryIds.ts` for load/refresh/resolve.
- Ensure the scraper integration can accept query ID overrides. If not, add a minimal GraphQL client for the affected endpoints.
- Log cache hits/misses at debug level only.

## Acceptance Criteria
- Query ID cache file is created on first successful refresh.
- 404 during search/scrape triggers a single refresh and retry.
- `xgpt query-ids --fresh` reports refreshed IDs and cache path.

## Risks
- Discovery can fail if X changes bundle structure; keep fallback IDs.
- Cache corruption; ensure atomic writes.
