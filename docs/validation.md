# Validation System

X-GPT uses TypeBox for runtime validation of CLI inputs and API parameters. The validation system provides type-safe schemas with helpful error messages.

## Overview

The validation system is located in `src/validation/schemas.ts` and provides:

- **Type definitions** - TypeBox schemas that generate TypeScript types
- **Runtime validation** - Validate inputs at runtime
- **Parser functions** - Parse and normalize common inputs
- **Error messages** - Descriptive validation errors

## Basic Usage

### Validating Input

```typescript
import { validate, validateOrThrow, Username } from './validation';

// Safe validation (returns result object)
const result = validate(Username, userInput);
if (result.success) {
  console.log('Valid username:', result.data);
} else {
  console.log('Errors:', result.errors);
}

// Validation with exception
try {
  const username = validateOrThrow(Username, userInput, 'username');
} catch (error) {
  console.error(error.message);
}
```

## Schema Types

### Date Validation

```typescript
import { DateString, DateRange, RelativeTimeRange } from './validation';

// ISO date format (YYYY-MM-DD)
const date = validateOrThrow(DateString, '2024-01-15');

// Date range
const range = validateOrThrow(DateRange, {
  start: '2024-01-01',
  end: '2024-01-31'
});

// Relative time (7d, 30d, 3m, 1y)
const relative = validateOrThrow(RelativeTimeRange, '30d');
```

### Username Validation

```typescript
import { Username, parseUsername } from './validation';

// Schema validation
const result = validate(Username, 'elonmusk');

// Parse with @ removal
const username = parseUsername('@elonmusk'); // Returns 'elonmusk'
```

Username rules:
- 1-15 characters
- Letters, numbers, underscores only
- No @ symbol (stripped if provided)

### Keyword Validation

```typescript
import { Keyword, KeywordList, parseKeywords } from './validation';

// Single keyword
const keyword = validateOrThrow(Keyword, 'AI');

// List of keywords
const keywords = validateOrThrow(KeywordList, ['AI', 'ML', 'GPT']);

// Parse comma-separated string
const parsed = parseKeywords('AI, machine learning, GPT');
// Returns ['AI', 'machine learning', 'GPT']
```

Keyword rules:
- 1-100 characters each
- Letters, numbers, spaces, hyphens, underscores
- 1-20 keywords per list

## Command Option Schemas

### Scrape Options

```typescript
import { ScrapeOptions, type ScrapeOptions as ScrapeOptionsType } from './validation';

const options: ScrapeOptionsType = {
  username: 'elonmusk',
  includeReplies: true,
  includeRetweets: false,
  maxTweets: 500,
  keywords: ['AI', 'SpaceX'],
  since: '2024-01-01',
  until: '2024-01-31',
  rateLimitProfile: 'moderate'
};

const result = validate(ScrapeOptions, options);
```

### Search Options

```typescript
import { SearchOptions, SearchMode } from './validation';

const options = {
  query: 'AI startup funding',
  maxTweets: 200,
  days: 30,
  since: '2024-01-01',
  until: '2024-01-31',
  mode: 'top' as const,
  embed: true
};

const result = validate(SearchOptions, options);
```

### Discover Options

```typescript
import { DiscoverOptions } from './validation';

const options = {
  query: 'AI researcher',
  maxResults: 50,
  save: true
};

const result = validate(DiscoverOptions, options);
```

### Ask Options

```typescript
import { AskOptions } from './validation';

const options = {
  question: 'What does this person think about AI?',
  topK: 10,
  model: 'gpt-4o-mini'
};

const result = validate(AskOptions, options);
```

### Embed Options

```typescript
import { EmbedOptions } from './validation';

const options = {
  model: 'text-embedding-3-small',
  batchSize: 500,
  searchSessionId: 42
};

const result = validate(EmbedOptions, options);
```

## Parser Functions

### Parse Date

```typescript
import { parseDate } from './validation';

const date = parseDate('2024-01-15');
// Returns: Date object

parseDate('invalid'); // Throws: Invalid date format
```

### Parse Relative Time Range

```typescript
import { parseRelativeTimeRange } from './validation';

const { start, end } = parseRelativeTimeRange('7d');
// Returns: { start: Date 7 days ago, end: Date now }

// Supported units:
// d - days
// w - weeks
// m - months
// y - years
```

### Parse Keywords

```typescript
import { parseKeywords } from './validation';

const keywords = parseKeywords('AI, ML, deep learning');
// Returns: ['AI', 'ML', 'deep learning']

// Trims whitespace, filters empty strings
parseKeywords('  AI ,  , ML  '); // ['AI', 'ML']
```

### Parse Username

```typescript
import { parseUsername } from './validation';

parseUsername('@elonmusk');  // Returns: 'elonmusk'
parseUsername('elonmusk');   // Returns: 'elonmusk'
parseUsername('invalid@!');  // Throws: Invalid username
```

## Validation Result

```typescript
interface ValidationResult<T> {
  success: boolean;
  data?: T;       // Present if success is true
  errors?: string[]; // Present if success is false
}
```

Example error output:

```typescript
const result = validate(Username, 'invalid@user!');
// {
//   success: false,
//   errors: ['/: Expected string matching pattern ^[a-zA-Z0-9_]+$']
// }
```

## Config Key Validation

```typescript
import { ConfigKeyPath } from './validation';

// Validates format: category.key
const result = validate(ConfigKeyPath, 'scraping.maxTweets');
// { success: true, data: 'scraping.maxTweets' }

validate(ConfigKeyPath, 'invalid');
// { success: false, errors: ['...'] }
```

## Schema Constraints

### Numeric Constraints

| Schema | Min | Max | Default |
|--------|-----|-----|---------|
| `ScrapeOptions.maxTweets` | 1 | 10,000 | 100 |
| `SearchOptions.maxTweets` | 1 | 10,000 | 100 |
| `SearchOptions.days` | 1 | 365 | - |
| `DiscoverOptions.maxResults` | 1 | 100 | 20 |
| `AskOptions.topK` | 1 | 50 | 5 |
| `EmbedOptions.batchSize` | 1 | 2,000 | 1,000 |

### String Constraints

| Schema | Min Length | Max Length |
|--------|------------|------------|
| `Username` | 1 | 15 |
| `Keyword` | 1 | 100 |
| `SearchOptions.query` | 1 | 500 |
| `DiscoverOptions.query` | 1 | 200 |
| `AskOptions.question` | 1 | 1,000 |

## Integration with Commands

```typescript
import { validateOrThrow, ScrapeOptions } from './validation';

export async function scrapeCommand(rawOptions: unknown): Promise<CommandResult> {
  // Validate and get typed options
  const options = validateOrThrow(ScrapeOptions, rawOptions, 'scrape options');

  // Now options is typed as ScrapeOptions
  console.log(options.username); // TypeScript knows this exists

  // ...
}
```

## Adding New Schemas

```typescript
import { Type, type Static } from '@sinclair/typebox';

// Define schema
export const MyOptions = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  count: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 10 })),
  enabled: Type.Optional(Type.Boolean({ default: true }))
});

// Generate TypeScript type
export type MyOptions = Static<typeof MyOptions>;

// Use in validation
const options = validateOrThrow(MyOptions, input, 'my options');
```

## Best Practices

1. **Validate early** - Validate inputs at command/API entry points
2. **Use typed schemas** - Let TypeBox generate types for type safety
3. **Provide context** - Include context in `validateOrThrow` for better errors
4. **Use parser functions** - For normalized input (usernames, keywords)
5. **Set reasonable defaults** - Use `default` in schema definitions

## Related Documentation

- [Commands](./commands.md) - Command implementation patterns
- [API Reference](./api-reference.md) - API parameter validation
- [Configuration](./configuration.md) - Config validation
