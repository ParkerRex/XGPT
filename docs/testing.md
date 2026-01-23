# Testing

X-GPT uses Bun's built-in test runner for unit, integration, and end-to-end testing.

## Test Structure

```
tests/
  unit/           # Unit tests for individual modules
  integration/    # Integration tests for API and server
  e2e/            # End-to-end tests (full workflows)
```

## Quick Start

```bash
bun test                    # Run all tests
bun test --watch            # Watch mode
bun test --coverage         # With coverage report

bun test tests/unit         # Unit tests only
bun test tests/integration  # Integration tests only
bun test tests/e2e          # E2E tests only
```

## Module Verification

Quick module verification test:

```bash
bun run test-modules.ts
```

This verifies:
- Rate limiting system (token bucket, profiles, estimation)
- Database operations (schema, queries, relationships)
- Command modules (all CLI commands load)
- Error handling (graceful failure modes)

## Integration Testing

Integration tests verify the web UI and API endpoints work correctly together.

### Test Setup Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { registerPageRoutes, registerApiRoutes } from '../../src/server/routes/index.js';

const TEST_DB_PATH = './test_server_tweets.db';

function createTestApp() {
  const app = new Elysia().use(html());
  registerPageRoutes(app);
  registerApiRoutes(app);
  return app;
}

describe('API Tests', () => {
  let app: Elysia;

  beforeAll(async () => {
    process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
    process.env.NODE_ENV = 'test';
    app = createTestApp();
  });

  afterAll(async () => {
    // Cleanup
  });

  // Tests...
});
```

### Request Helpers

```typescript
// Simple GET/POST helper
async function request(app: Elysia, path: string, options: RequestInit = {}): Promise<Response> {
  const url = `http://localhost${path}`;
  return app.handle(new Request(url, options));
}

// JSON POST helper
async function postJson(app: Elysia, path: string, body: Record<string, unknown>): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
```

### Testing Page Routes

```typescript
describe('Page Routes', () => {
  it('should render dashboard page at /', async () => {
    const response = await request(app, '/');

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Dashboard');
    expect(html).toContain('XGPT');
  });

  it('should include navigation links in all pages', async () => {
    const pages = ['/', '/scrape', '/search', '/discover', '/ask', '/config'];

    for (const page of pages) {
      const response = await request(app, page);
      const html = await response.text();

      expect(html).toContain('href="/"');
      expect(html).toContain('href="/scrape"');
      expect(html).toContain('href="/search"');
    }
  });
});
```

### Testing API Endpoints

```typescript
describe('API Routes', () => {
  it('should return jobs list at GET /api/jobs', async () => {
    const response = await request(app, '/api/jobs');

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('script');
  });

  it('should return 404 for non-existent job cancellation', async () => {
    const response = await request(app, '/api/jobs/non-existent-id/cancel', {
      method: 'POST'
    });

    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html.toLowerCase()).toContain('not found');
  });

  it('should return SSE stream at GET /api/jobs/stream', async () => {
    const response = await request(app, '/api/jobs/stream');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    // Read first chunk to verify SSE format
    const reader = response.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: jobs');
      expect(text).toContain('data:');
      reader.releaseLock();
    }
  });
});
```

### Testing Validation

```typescript
describe('API Validation', () => {
  it('should return proper error for missing required fields', async () => {
    const response = await postJson(app, '/api/scrape', {});
    expect(response.status).toBe(422); // Elysia validation error
  });

  it('should accept requests with valid fields', async () => {
    const response = await postJson(app, '/api/scrape', {
      username: 'testuser'
    });
    expect(response.status).not.toBe(422);
  });
});
```

### Testing Error Handling

```typescript
describe('Error Handling', () => {
  it('should handle 404 for unknown routes', async () => {
    const response = await request(app, '/unknown-route');
    expect(response.status).toBe(404);
  });

  it('should handle malformed JSON', async () => {
    const response = await request(app, '/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json }'
    });
    expect(response.status).toBe(400);
  });

  it('should return JSON error with Accept header', async () => {
    const response = await request(app, '/api/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({})
    });

    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });
});
```

## Unit Testing

### Testing Utilities

```typescript
import { describe, it, expect } from 'bun:test';
import { formatNumber, formatDuration } from '../src/utils/format';

describe('Format Utilities', () => {
  it('should format large numbers', () => {
    expect(formatNumber(1234567)).toBe('1.2M');
    expect(formatNumber(1234567890)).toBe('1.2B');
  });

  it('should handle undefined', () => {
    expect(formatNumber(undefined)).toBe('-');
  });
});
```

### Testing Error Classes

```typescript
import { describe, it, expect } from 'bun:test';
import { AuthenticationError, RateLimitError, ErrorCategory } from '../src/errors';

describe('Error Classes', () => {
  it('should create authentication error with correct properties', () => {
    const error = new AuthenticationError('Token expired', { command: 'scrape' });

    expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
    expect(error.message).toBe('Token expired');
    expect(error.context?.command).toBe('scrape');
    expect(error.recoveryActions).toBeDefined();
  });
});
```

### Testing Validation

```typescript
import { describe, it, expect } from 'bun:test';
import { validate, Username, parseUsername } from '../src/validation';

describe('Username Validation', () => {
  it('should validate correct usernames', () => {
    expect(validate(Username, 'elonmusk').success).toBe(true);
    expect(validate(Username, 'test_user').success).toBe(true);
  });

  it('should reject invalid usernames', () => {
    expect(validate(Username, '@elonmusk').success).toBe(false);
    expect(validate(Username, 'invalid!user').success).toBe(false);
  });

  it('should parse and normalize usernames', () => {
    expect(parseUsername('@elonmusk')).toBe('elonmusk');
    expect(parseUsername('elonmusk')).toBe('elonmusk');
  });
});
```

## Mocking External APIs

For tests that would call external APIs (Twitter, OpenAI), use the `.skip` modifier:

```typescript
// Tests that call real APIs - skip in CI
it.skip('should scrape tweets from real API', async () => {
  const response = await postJson(app, '/api/scrape', {
    username: 'testuser'
  });
  expect(response.status).not.toBe(422);
});
```

For proper mocking, create mock implementations:

```typescript
import { mock } from 'bun:test';

// Mock the Twitter scraper module before importing code that uses it
mock.module('@the-convocation/twitter-scraper', () => ({
  Scraper: class {
    async *searchTweets() {
      yield { id: '1', text: 'Test tweet', username: 'testuser' };
    }
  }
}));

const { searchCommand } = await import('../src/commands/search');
```

## Testing Best Practices

1. **Isolate tests** - Use separate test databases
2. **Clean up** - Remove test artifacts in `afterAll`
3. **Skip external calls** - Use `.skip` for real API calls in CI
4. **Test edge cases** - Empty inputs, invalid data, error conditions
5. **Check response format** - Verify both status and content
6. **Test HTML structure** - For page routes, verify expected elements

## Running Specific Tests

```bash
# Run specific test file
bun test tests/integration/server.test.ts

# Run tests matching pattern
bun test --test-name-pattern "Page Routes"

# Run with verbose output
bun test --verbose

# Run single test
bun test --test-name-pattern "should render dashboard"
```

## Coverage

```bash
bun test --coverage
```

Coverage reports show:
- Statement coverage
- Branch coverage
- Function coverage
- Line coverage

## Continuous Integration

Example CI configuration:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - run: bun install
      - run: bun test
```

## Expected Output

Successful test run:

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

## Related Documentation

- [Commands](./commands.md) - Testing command functions
- [API Reference](./api-reference.md) - API endpoints to test
- [Error Handling](./errors.md) - Testing error scenarios
