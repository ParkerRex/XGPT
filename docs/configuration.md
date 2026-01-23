# Configuration System

X-GPT provides a persistent configuration system for storing user preferences, API keys, and default settings.

## Overview

The configuration system is located in `src/config/`:

```
src/config/
  schema.ts    # Configuration schema and defaults
  manager.ts   # Configuration persistence and access
  index.ts     # Exports
```

## Configuration File

Configuration is stored in `~/.xgpt/config.json` and persists across sessions.

## Configuration Schema

### API Settings

```typescript
api: {
  openaiKey?: string;    // OpenAI API key for embeddings/Q&A
  authToken?: string;    // X/Twitter auth token
  ct0Token?: string;     // X/Twitter CSRF token
}
```

### Scraping Defaults

```typescript
scraping: {
  rateLimitProfile: 'conservative' | 'moderate' | 'aggressive';  // Default: 'conservative'
  maxTweets: number;              // Default: 1000
  includeReplies: boolean;        // Default: false
  includeRetweets: boolean;       // Default: false
  defaultKeywords: string[];      // Default: []
  defaultTimeRange: 'last-week' | 'last-month' | 'last-3-months' |
                    'last-6-months' | 'last-year' | 'lifetime';  // Default: 'last-month'
}
```

### Embedding Settings

```typescript
embedding: {
  model: 'text-embedding-3-small' | 'text-embedding-3-large' |
         'text-embedding-ada-002';  // Default: 'text-embedding-3-small'
  batchSize: number;               // Default: 500
  autoGenerate: boolean;           // Default: true
}
```

### Query Settings

```typescript
query: {
  defaultTopK: number;        // Default: 5
  defaultThreshold: number;   // Default: 0.7
  showSources: boolean;       // Default: true
}
```

### Output Settings

```typescript
output: {
  format: 'json' | 'jsonl' | 'csv' | 'markdown' | 'txt';  // Default: 'json'
  includeMetadata: boolean;                      // Default: true
  timestampFormat: 'iso' | 'relative' | 'human'; // Default: 'human'
}
```

### UI Preferences

```typescript
ui: {
  showProgressBars: boolean;          // Default: true
  verboseLogging: boolean;            // Default: false
  colorOutput: boolean;               // Default: true
  confirmDestructiveActions: boolean; // Default: true
}
```

### Advanced Settings

```typescript
advanced: {
  databasePath?: string;     // Custom database path
  cacheEnabled: boolean;     // Default: true
  cacheTtlHours: number;     // Default: 24
  queryIdCacheMaxEntries: number;        // Default: 200
  queryIdCacheSnapshotEnabled: boolean;  // Default: true
  backupEnabled: boolean;    // Default: true
  maxBackupFiles: number;    // Default: 5
}
```

## CLI Commands

### List All Settings

```bash
xgpt config list
```

Output:
```
API Settings
  api.openaiKey: sk-...
  api.authToken: [set]
  api.ct0Token: [set]

Scraping Defaults
  scraping.rateLimitProfile: conservative
  scraping.maxTweets: 1000
  scraping.includeReplies: false
  ...
```

### Get Specific Value

```bash
xgpt config get scraping.rateLimitProfile
# conservative
```

### Set Value

```bash
xgpt config set scraping.rateLimitProfile moderate
xgpt config set scraping.maxTweets 500
xgpt config set api.openaiKey sk-your-key-here
```

### Reset to Defaults

```bash
xgpt config reset              # Reset all
xgpt config reset scraping     # Reset category
```

## Programmatic Access

### Loading Configuration

```typescript
import { loadConfig, getConfig } from './config';

// Load full config (with defaults)
const config = await loadConfig();
console.log(config.scraping.maxTweets);

// Get specific value
const profile = await getConfig('scraping.rateLimitProfile');
```

### Setting Configuration

```typescript
import { setConfig, updateConfig } from './config';

// Set single value
await setConfig('scraping.maxTweets', 500);

// Update multiple values
await updateConfig({
  'scraping.maxTweets': 500,
  'scraping.rateLimitProfile': 'moderate'
});
```

### Type-Safe Access

```typescript
import type { UserConfig, ConfigKeyPath } from './config/schema';

// TypeScript knows all valid key paths
const key: ConfigKeyPath = 'scraping.rateLimitProfile';

// Full config type
const config: UserConfig = await loadConfig();
```

## All Configuration Keys

### API Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `api.openaiKey` | string | - | OpenAI API key |
| `api.authToken` | string | - | X/Twitter auth token |
| `api.ct0Token` | string | - | X/Twitter CSRF token |

### Scraping Defaults
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `scraping.rateLimitProfile` | enum | conservative | Rate limiting profile |
| `scraping.maxTweets` | number | 1000 | Default max tweets |
| `scraping.includeReplies` | boolean | false | Include replies |
| `scraping.includeRetweets` | boolean | false | Include retweets |
| `scraping.defaultKeywords` | string[] | [] | Default filter keywords |
| `scraping.defaultTimeRange` | enum | last-month | Default time range |

### Embedding Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `embedding.model` | enum | text-embedding-3-small | Embedding model |
| `embedding.batchSize` | number | 500 | Batch size |
| `embedding.autoGenerate` | boolean | true | Auto-generate after scrape |

### Query Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `query.defaultTopK` | number | 5 | Results to return |
| `query.defaultThreshold` | number | 0.7 | Similarity threshold |
| `query.showSources` | boolean | true | Show source tweets |

### Output Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `output.format` | enum | json | Export format |
| `output.includeMetadata` | boolean | true | Include metadata |
| `output.timestampFormat` | enum | human | Timestamp display |

### UI Preferences
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ui.showProgressBars` | boolean | true | Show progress bars |
| `ui.verboseLogging` | boolean | false | Verbose output |
| `ui.colorOutput` | boolean | true | Colored terminal |
| `ui.confirmDestructiveActions` | boolean | true | Confirm dangerous ops |

### Advanced Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `advanced.databasePath` | string | data/xgpt.db | Database location |
| `advanced.cacheEnabled` | boolean | true | Enable caching |
| `advanced.cacheTtlHours` | number | 24 | Cache lifetime |
| `advanced.queryIdCacheMaxEntries` | number | 200 | Max cached query IDs |
| `advanced.queryIdCacheSnapshotEnabled` | boolean | true | Use snapshot fallback for query IDs |
| `advanced.backupEnabled` | boolean | true | Auto backups |
| `advanced.maxBackupFiles` | number | 5 | Max backup files |

## Validation Rules

The configuration system validates values against these rules:

```typescript
const CONFIG_VALIDATION = {
  'scraping.rateLimitProfile': ['conservative', 'moderate', 'aggressive'],
  'scraping.maxTweets': { min: 1, max: 50000 },
  'scraping.defaultTimeRange': ['last-week', 'last-month', ...],
  'embedding.model': ['text-embedding-3-small', 'text-embedding-3-large', ...],
  'embedding.batchSize': { min: 1, max: 2000 },
  'query.defaultTopK': { min: 1, max: 50 },
  'query.defaultThreshold': { min: 0, max: 1 },
  'output.format': ['json', 'jsonl', 'csv', 'markdown', 'txt'],
  'output.timestampFormat': ['iso', 'relative', 'human'],
  'advanced.cacheTtlHours': { min: 1, max: 168 },
  'advanced.queryIdCacheMaxEntries': { min: 10, max: 2000 },
  'advanced.maxBackupFiles': { min: 1, max: 50 }
};
```

## Environment Variable Fallback

Configuration values fall back to environment variables:

```bash
# .env file
OPENAI_KEY=sk-your-key
AUTH_TOKEN=your-auth-token
CT0=your-ct0-token
```

Priority: Config file > Environment variables > Defaults

## Web UI Configuration

The web UI provides an inline configuration editor at `/config`:

```html
<form hx-post="/api/config/set" hx-target="#result">
  <input name="key" value="scraping.maxTweets">
  <input name="value" type="number" value="500">
  <button type="submit">Save</button>
</form>
```

Changes are saved immediately and take effect on the next operation.

## Best Practices

1. **Set API keys via config** instead of .env for persistence:
   ```bash
   xgpt config set api.openaiKey sk-your-key
   ```

2. **Use conservative profile** until you understand rate limits:
   ```bash
   xgpt config set scraping.rateLimitProfile conservative
   ```

3. **Enable verbose logging** when debugging:
   ```bash
   xgpt config set ui.verboseLogging true
   ```

4. **Check config before operations**:
   ```bash
   xgpt config list
   ```

## Related Documentation

- [Setup](./setup.md) - Initial configuration
- [Usage](./usage.md) - Using configuration in commands
- [Rate Limiting](./architecture.md#rate-limiting) - Rate limit profiles
