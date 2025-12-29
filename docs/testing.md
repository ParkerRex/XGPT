# Testing

## Quick Test

```bash
bun test
```

Verifies all core modules work correctly:

- Rate limiting system (token bucket, profiles, estimation)
- Database operations (schema, queries, relationships)
- Command modules (all CLI commands load)
- Error handling (graceful failure modes)

## Test Commands

```bash
bun test                    # Quick module verification
bun test --watch            # Watch mode
bun test --coverage         # Coverage report

bun test tests/unit         # Unit tests
bun test tests/integration  # Integration tests
bun test tests/e2e          # End-to-end tests
```

## Expected Output

```
Testing XGPT Modules
==============================

Testing Rate Limiting...
   Rate limit profiles loaded
   Rate limit manager initialized
   Tweet estimator works
   Error detection works

Testing Database Schema...
   Database schema loaded

Testing Database Queries...
   Database queries loaded

Testing Command Modules...
   Command modules loaded

RESULTS
--------------------
Passed: 4/4
Success Rate: 100%
```
