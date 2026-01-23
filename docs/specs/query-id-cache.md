# Query ID Cache Spec

## Summary

Introduce a local, persistent cache for Twitter/X GraphQL query IDs keyed by operation name and feature set. The cache reduces repeated discovery calls, improves request latency, and avoids breakage when remote query ID lookups fail.

## Motivation

Some Twitter/X GraphQL endpoints require a `queryId` that is not stable in source code. If the ID is fetched on every run, the CLI incurs extra network calls and is more likely to fail when the discovery endpoint is unavailable. A small, persistent cache makes operations more reliable without changing the runtime behavior for users.

## Goals

- Cache query IDs by operation name and feature signature.
- Persist cache across runs and share across CLI and server modes.
- Support TTL-based refresh and forced refresh on failure.
- Provide deterministic fallback to a bundled snapshot.
- Expose minimal configuration knobs that align with existing caching config.

## Non-goals

- Automatic discovery of new GraphQL operations without explicit usage.
- Sharing cache across machines or syncing to a remote store.
- Bypassing authentication or scraping restrictions.

## Glossary

- **Operation name**: The GraphQL operation identifier used by Twitter/X.
- **Query ID**: The opaque ID required by Twitter/X for GraphQL requests.
- **Feature signature**: A stable hash derived from feature flags and variable schema relevant to the operation.
- **Snapshot**: A bundled, static mapping of operation names to query IDs used as a fallback.

## User Stories

- As a CLI user, repeated `search` or `discover` runs should not re-fetch query IDs unless they are stale or broken.
- As a server user, the API should not fail if the discovery endpoint is temporarily unavailable.
- As a maintainer, I can invalidate or refresh specific cached entries without clearing the entire cache.

## Functional Requirements

- Look up query ID by `(operationName, featureSignature)`.
- If a valid cache entry exists (not expired), use it.
- If missing or expired, attempt to discover a fresh query ID.
- On discovery failure, fall back to the snapshot if present and not explicitly disabled.
- On request failure that indicates an invalid query ID, mark the entry as invalid and re-discover once.
- Record usage metadata (`lastUsedAt`, `useCount`) for debugging and pruning.

## Data Model

Persisted in SQLite as part of the existing database to avoid new storage systems.

Table: `query_id_cache`

- `id` INTEGER PRIMARY KEY
- `operationName` TEXT NOT NULL
- `featureSignature` TEXT NOT NULL
- `queryId` TEXT NOT NULL
- `source` TEXT NOT NULL  // discovery | snapshot | manual
- `fetchedAt` INTEGER NOT NULL  // unix ms
- `expiresAt` INTEGER NOT NULL  // unix ms
- `lastUsedAt` INTEGER NOT NULL // unix ms
- `useCount` INTEGER NOT NULL
- `status` TEXT NOT NULL        // active | invalid | expired
- `error` TEXT                  // last error summary

Indexes:

- Unique: `(operationName, featureSignature)`
- Index: `expiresAt`
- Index: `lastUsedAt`

## Cache Policy

- Default TTL: 24 hours (align with `advanced.cacheTtlHours`).
- If `advanced.cacheEnabled` is false, skip cache lookup and write-through.
- Refresh strategy:
  - Soft refresh on expiry before use.
  - Hard refresh on invalid query ID error.
- Max entries: 200 (prune least-recently-used when exceeded).

## API Surface

### Module

`src/twitter/queryIdCache.ts`

- `getQueryId(operationName, featureSignature, options)`
  - returns `{ queryId, source, refreshed }`
- `invalidateQueryId(operationName, featureSignature, reason)`
- `clearQueryIdCache()`

### Error Signals

- `QueryIdInvalidError` when a request indicates the cached ID is invalid.
- `QueryIdDiscoveryError` when discovery fails and no snapshot exists.

## Snapshot Fallback

- Store a static mapping in `src/twitter/queryIdSnapshot.ts`.
- Version the snapshot by release (e.g., `snapshotVersion: 2026-01-23`).
- Use snapshot only when discovery fails or when running in offline mode.

## Observability

- Log events under `loggers.api` or `loggers.scrape`:
  - `query_id_cache.hit`, `.miss`, `.refresh`, `.invalidated`, `.fallback`.
- Expose cache stats in `db --stats` output:
  - hit rate, stale refresh count, invalidation count.

## Configuration

- `advanced.cacheEnabled` (existing)
- `advanced.cacheTtlHours` (existing)
- `advanced.queryIdCacheMaxEntries` (new, default 200)
- `advanced.queryIdCacheSnapshotEnabled` (new, default true)

## Failure Modes and Recovery

- **Discovery endpoint down**: use snapshot; log warning; mark as stale.
- **Invalid query ID**: mark entry `invalid`, refresh once, then surface error.
- **DB unavailable**: run in memory-only mode for the process; do not block.

## Security and Privacy

- Cache contains only query metadata and IDs, no user data.
- Do not log full query IDs in debug logs; log prefixes only.

## Testing Plan

- Unit: cache hit/miss, expiry, invalidation, prune ordering.
- Integration: simulated discovery failure with snapshot fallback.
- Regression: ensure search/discover flows succeed with cache enabled/disabled.

## Rollout

- Add table and migration, guarded by `advanced.cacheEnabled`.
- Ship with snapshot enabled by default.
- Monitor logs for invalidation spikes and adjust TTL if needed.

## Open Questions

- Which operations require query ID caching for this repo today?
- Should feature signature include request variables or only feature flags?
- Should we allow manual overrides via config for power users?
