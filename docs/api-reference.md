# API Reference

X-GPT's web server exposes REST API endpoints for all major operations. The API is built with Elysia and returns HTML (for HTMX) or JSON based on the `Accept` header.

## Base URL

```
http://localhost:3002/api
```

`xgpt serve` and `bun dev` default to port `3002`. If you pass `--port` or call `createServer()` directly (default `3000`), adjust the base URL.

## Response Formats

### Success (HTML)

Most endpoints return HTML for HTMX consumption:

```html
<div class="result success">
  <strong>Success!</strong><br>
  Collected 150 tweets<br>
  Session ID: 42
</div>
```

### Error (HTML)

```html
<div class="result error">
  <div style="text-align: left;">
    <strong style="color: #ef4444;">Rate Limited</strong>
    <p>You've made too many requests...</p>
    <div>
      <strong>Suggestions:</strong>
      <ul>
        <li>Wait 15-30 minutes before trying again</li>
      </ul>
    </div>
  </div>
</div>
```

### JSON Response

Request with `Accept: application/json` for JSON:

```json
{
  "error": {
    "code": "RATE_LIMIT",
    "message": "Too many requests",
    "details": null,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "status": 429
}
```

## Request Format

The web UI sends JSON payloads via HTMX `json-enc`. Use `Content-Type: application/json` as shown in the examples below.

## Endpoints

### Scrape Tweets

Scrape tweets from a Twitter user's profile.

```http
POST /api/scrape
Content-Type: application/json
```

**Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `username` | string | Yes | - | Twitter username (without @) |
| `includeReplies` | boolean | No | false | Include replies |
| `includeRetweets` | boolean | No | false | Include retweets |
| `maxTweets` | number | No | 100 | Maximum tweets to fetch |

**Example:**

```bash
curl -X POST http://localhost:3002/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"username":"elonmusk","maxTweets":500,"includeReplies":true}'
```

**Response Data:**
- `tweetsCollected` - Number of tweets scraped
- `sessionId` - Session ID for tracking

---

### Search Tweets

Search Twitter for tweets matching a query.

```http
POST /api/search
Content-Type: application/json
```

**Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query (comma-separated terms) |
| `maxTweets` | number | No | 100 | Maximum tweets to fetch |
| `days` | number | No | - | Search tweets from last N days (no date filter if omitted) |
| `mode` | string | No | "latest" | Search mode: "latest" or "top" |
| `embed` | boolean | No | false | Generate embeddings after search |

If `days`, `since`, and `until` are all omitted, the API applies no date filter. (The CLI defaults to 7 days when no date range is provided.)

**Example:**

```bash
curl -X POST http://localhost:3002/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"AI,machine learning","maxTweets":200,"days":30,"mode":"top","embed":true}'
```

**Response Data:**
- `tweetsCollected` - Number of tweets found
- `usersCreated` - Number of new users added
- `sessionId` - Session ID
- `embeddingsGenerated` - Boolean if embeddings were created

---

### Discover Users

Find Twitter profiles by bio, name, or keywords.

```http
POST /api/discover
Content-Type: application/json
```

**Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query for profiles |
| `maxResults` | number | No | 20 | Maximum profiles to find |
| `save` | boolean | No | true | Save profiles to database |

**Example:**

```bash
curl -X POST http://localhost:3002/api/discover \
  -H "Content-Type: application/json" \
  -d '{"query":"AI researcher","maxResults":50,"save":true}'
```

**Response Data:**
- `profiles` - Array of discovered profiles
- `savedCount` - Number saved to database

---

### Ask Question

Ask a question using semantic search over embedded tweets.

```http
POST /api/ask
Content-Type: application/json
```

**Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `question` | string | Yes | - | Question to answer |
| `topK` | number | No | 5 | Number of relevant tweets |
| `model` | string | No | "gpt-4o-mini" | OpenAI model for answering |

**Example:**

```bash
curl -X POST http://localhost:3002/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What does this person think about AI?","topK":10,"model":"gpt-4o"}'
```

**Response Data:**
- `answer` - AI-generated answer
- `relevantTweets` - Array of relevant tweets with similarity scores

---

### Generate Embeddings

Generate vector embeddings for tweets without embeddings.

```http
POST /api/embed
Content-Type: application/json
```

**Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `model` | string | No | "text-embedding-3-small" | OpenAI embedding model |
| `batchSize` | number | No | 1000 | Batch size for processing |

**Example:**

```bash
curl -X POST http://localhost:3002/api/embed \
  -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-3-small","batchSize":500}'
```

**Response Data:**
- `tweetsEmbedded` - Number of tweets embedded
- `model` - Model used

---

### Initialize Database

Initialize or reset the database.

```http
POST /api/db/init
```

**Example:**

```bash
curl -X POST http://localhost:3002/api/db/init
```

---

### Set Configuration

Update a configuration value.

```http
POST /api/config/set
Content-Type: application/json
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Config key path (e.g., "scraping.maxTweets") |
| `value` | string | Yes | New value |

**Example:**

```bash
curl -X POST http://localhost:3002/api/config/set \
  -H "Content-Type: application/json" \
  -d '{"key":"scraping.rateLimitProfile","value":"moderate"}'
```

---

## Job Management

### Get All Jobs

Get current job status for the taskbar.

```http
GET /api/jobs
```

Returns HTML for the job taskbar.

---

### Cancel Job

Cancel a running job.

```http
POST /api/jobs/:id/cancel
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Job ID to cancel |

**Example:**

```bash
curl -X POST http://localhost:3002/api/jobs/scrape-1704067200000/cancel
```

**Responses:**

- `200` - Job cancelled successfully
- `404` - Job not found or already completed

---

### Job Updates Stream (SSE)

Server-Sent Events stream for real-time job updates.

```http
GET /api/jobs/stream
```

**Event Format:**

```
event: jobs
data: <html content for taskbar>
data: <continued html>

: heartbeat
```

**Client Usage:**

```javascript
const eventSource = new EventSource('/api/jobs/stream');

eventSource.addEventListener('jobs', (event) => {
  document.getElementById('taskbar').innerHTML = event.data;
});

eventSource.onerror = () => {
  // Reconnect on error
  setTimeout(() => location.reload(), 5000);
};
```

---

## Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `BAD_REQUEST` | Invalid request parameters |
| 401 | `UNAUTHORIZED` | Authentication required |
| 403 | `FORBIDDEN` | Access denied |
| 404 | `NOT_FOUND` | Resource not found |
| 422 | `VALIDATION_ERROR` | Input validation failed |
| 429 | `RATE_LIMIT` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable |

## HTMX Integration

All endpoints are designed for HTMX integration:

```html
<!-- Scrape form -->
<form hx-post="/api/scrape" hx-target="#results">
  <input name="username" required>
  <input name="maxTweets" type="number" value="100">
  <button type="submit">Scrape</button>
</form>
<div id="results"></div>

<!-- Job taskbar with SSE -->
<div id="taskbar"
     hx-ext="sse"
     sse-connect="/api/jobs/stream"
     sse-swap="jobs">
</div>
```

## Rate Limiting

The API inherits Twitter's rate limits. Best practices:

- Use `conservative` rate limit profile for safety
- Wait 15-30 minutes after rate limit errors
- Start with small `maxTweets` values
- Avoid concurrent requests

## Authentication

The API uses environment variables for authentication:

- `OPENAI_KEY` - Required for embedding and ask endpoints
- `AUTH_TOKEN` - Twitter auth token for scraping
- `CT0` - Twitter CSRF token for scraping

These are configured in `.env` or via the config system.

## Related Documentation

- [Server Architecture](./server.md) - Server implementation details
- [Error Handling](./errors.md) - Error response formats
- [Job Tracking](./jobs.md) - Job system details
- [Configuration](./configuration.md) - Config key reference
