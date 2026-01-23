# Error Handling System

X-GPT includes a comprehensive error handling system that provides categorized errors, user-friendly messages, and actionable recovery suggestions.

## Architecture

The error system is located in `src/errors/` and consists of four main modules:

```
src/errors/
  types.ts      # Error classes and enums
  handler.ts    # Centralized error handling
  messages.ts   # User-friendly error messages
  api.ts        # API-specific error handling
  index.ts      # Exports
```

## Error Categories

Errors are categorized to enable automatic handling and appropriate recovery suggestions:

| Category | Description | Example |
|----------|-------------|---------|
| `AUTHENTICATION` | Invalid credentials or tokens | Missing OpenAI API key, expired Twitter cookies |
| `RATE_LIMIT` | Too many requests | Twitter 429 responses, quota exceeded |
| `NETWORK` | Connection issues | Timeout, DNS failure, connection refused |
| `API_ERROR` | Downstream API failures | OpenAI API errors, service issues |
| `DATABASE` | SQLite/Drizzle errors | Table not found, migration failed |
| `USER_INPUT` | Invalid parameters | Invalid username, bad date format |
| `COMMAND_USAGE` | CLI usage errors | Missing required arguments, invalid flag combinations |
| `CONFIGURATION` | Settings issues | Missing .env file, invalid config value |
| `DATA_VALIDATION` | Data format errors | Invalid JSON, schema mismatch |
| `FILE_SYSTEM` | File operations | Permission denied, file not found |
| `SYSTEM` | Runtime errors | Memory, unexpected crashes |
| `UNKNOWN` | Unclassified errors | Fallback category |

## Error Severity Levels

| Severity | Description | Action |
|----------|-------------|--------|
| `LOW` | Warning, operation can continue | Informational |
| `MEDIUM` | Error, operation failed but recoverable | Retry suggested |
| `HIGH` | Critical, requires user action | User intervention needed |
| `FATAL` | System error, application should exit | Immediate attention |

## Error Classes

### Base Error: XGPTError

All errors extend from `XGPTError`:

```typescript
import { XGPTError, ErrorCategory, ErrorSeverity } from './errors';

const error = new XGPTError({
  code: 'CUSTOM_ERROR',
  category: ErrorCategory.USER_INPUT,
  severity: ErrorSeverity.MEDIUM,
  title: 'Custom Error',
  message: 'Something went wrong',
  technicalDetails: 'Stack trace here...',
  context: {
    command: 'scrape',
    username: 'example'
  },
  recoveryActions: [
    { description: 'Try again', command: 'xgpt scrape example' }
  ]
});
```

### Specialized Error Classes

Pre-configured error classes for common scenarios:

```typescript
import {
  AuthenticationError,
  RateLimitError,
  NetworkError,
  DatabaseError,
  ValidationError,
  ConfigurationError
} from './errors';

// Authentication error with built-in recovery suggestions
throw new AuthenticationError(
  'OpenAI API key is missing',
  { command: 'embed' }
);

// Rate limit error
throw new RateLimitError(
  'Twitter rate limit exceeded',
  { operation: 'scraping', username: 'elonmusk' }
);

// Database error
throw new DatabaseError(
  'Failed to insert tweet',
  { command: 'scrape' }
);
```

## Using the Error Handler

### In Commands

Use `handleCommandError` for consistent error handling:

```typescript
import { handleCommandError } from './errors';

export async function scrapeCommand(options: ScrapeOptions): Promise<CommandResult> {
  try {
    // Command logic...
  } catch (error) {
    return handleCommandError(error, {
      command: 'scrape',
      username: options.username,
      operation: 'tweet_scraping'
    });
  }
}
```

### Error Handler Instance

The singleton `ErrorHandler` provides additional functionality:

```typescript
import { errorHandler, createError, handleWarning } from './errors';

// Initialize with user config (enables verbose logging if configured)
await errorHandler.initialize();

// Create typed errors
const error = createError(
  ErrorCategory.AUTHENTICATION,
  'Token expired',
  { command: 'scrape' }
);

// Handle non-critical warnings
handleWarning('Using default rate limit profile', { command: 'scrape' });
```

## Automatic Error Categorization

The error handler automatically categorizes errors based on message patterns:

```typescript
// These are automatically detected:
throw new Error('rate limit exceeded');      // -> RateLimitError
throw new Error('unauthorized');             // -> AuthenticationError
throw new Error('ECONNREFUSED');            // -> NetworkError
throw new Error('sqlite error');            // -> DatabaseError
throw new Error('invalid username format'); // -> ValidationError
```

Pattern matching rules in `handler.ts`:

```typescript
const ERROR_PATTERNS = {
  authentication: [/api key/i, /unauthorized/i, /forbidden/i, ...],
  rateLimit: [/rate limit/i, /too many requests/i, /429/, ...],
  network: [/network/i, /timeout/i, /enotfound/i, ...],
  database: [/sqlite/i, /drizzle/i, /migration/i, ...],
  validation: [/invalid/i, /required.*parameter/i, ...],
  configuration: [/config/i, /\.env/i, ...]
};
```

## User-Friendly Error Messages

The `messages.ts` module provides human-readable error messages for the web UI:

```typescript
import { toFriendlyError, formatFriendlyErrorHtml } from './errors';

// Convert any error to user-friendly format
const friendly = toFriendlyError(error);
// Returns: { title, message, suggestions, severity }

// Format for web UI
const html = formatFriendlyErrorHtml(friendly);
```

### Error Message Examples

| Technical Error | User-Friendly Title | Message |
|----------------|---------------------|---------|
| `ECONNREFUSED` | Connection Refused | Could not connect to the server. The service might be down... |
| `429` | Rate Limited | You've made too many requests. Twitter limits how often... |
| `401` | Authentication Failed | Your credentials are invalid or expired... |
| `sqlite error` | Database Error | There was an issue with the database... |

## API Error Handling

For web server routes, use `ApiError` and factory functions:

```typescript
import { ApiError, ApiErrors, toApiError, createErrorResponse } from './errors';

// Factory functions for common HTTP errors
throw ApiErrors.badRequest('Username is required');
throw ApiErrors.notFound('User');
throw ApiErrors.unauthorized('Invalid token');
throw ApiErrors.rateLimit('Too many requests');
throw ApiErrors.validation('Invalid date format', 'since');

// Convert any error to ApiError
const apiError = toApiError(unknownError);

// Create standardized response for Elysia
app.post('/api/scrape', async ({ body, set }) => {
  try {
    // ...
  } catch (error) {
    return createErrorResponse(error, set);
  }
});
```

### HTTP Status Mapping

| Error Category | HTTP Status |
|---------------|-------------|
| `AUTHENTICATION` | 401 |
| `RATE_LIMIT` | 429 |
| `USER_INPUT` | 400 |
| `DATA_VALIDATION` | 422 |
| `DATABASE` | 500 |
| `NETWORK` | 503 |
| `SYSTEM` | 500 |

## Error Display Format

### CLI Display

```typescript
const error = new AuthenticationError('API key missing');
console.error(error.toDisplayFormat());
```

Output:
```
[error] Authentication Error
   API key missing

[tip] Suggested actions:
   1. Check your API keys and tokens
      Command: xgpt config list
   2. Update your OpenAI API key
      Command: xgpt config set api.openaiKey <your-key>
```

### JSON Format (for logging)

```typescript
console.log(JSON.stringify(error.toJSON(), null, 2));
```

Output:
```json
{
  "code": "AUTH_ERROR",
  "category": "AUTHENTICATION",
  "severity": "HIGH",
  "title": "Authentication Error",
  "message": "API key missing",
  "recoveryActions": [...],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Best Practices

1. **Always provide context** when handling errors:
   ```typescript
   return handleCommandError(error, {
     command: 'scrape',
     username,
     operation: 'tweet_fetch'
   });
   ```

2. **Use specific error classes** when throwing:
   ```typescript
   throw new ValidationError('Username cannot be empty');
   ```

3. **Chain original errors** to preserve stack traces:
   ```typescript
   throw new DatabaseError('Insert failed', context, originalError);
   ```

4. **Include recovery actions** for actionable errors:
   ```typescript
   throw new XGPTError({
     // ...
     recoveryActions: [
       { description: 'Check config', command: 'xgpt config list' },
       { description: 'View docs', url: 'https://...' }
     ]
   });
   ```

## Related Documentation

- [Command Runner](./commands.md) - How commands use error handling
- [API Reference](./api-reference.md) - API error responses
- [Configuration](./configuration.md) - Error-related settings
