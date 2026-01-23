# Server Architecture

X-GPT's web server provides a browser-based interface for all CLI functionality. Built with Elysia and HTMX, it delivers a reactive experience without complex JavaScript frameworks.

## Overview

The server is located in `src/server/` with this structure:

```
src/server/
  index.ts              # Main server setup and configuration
  routes/
    pages.ts            # HTML page routes
    api.ts              # REST API endpoints
  templates/
    layout.ts           # Base HTML layout with CSS
    components.ts       # Reusable UI components
    index.ts            # Exports
```

## Starting the Server

### CLI Command

```bash
xgpt serve              # Default port 3002
xgpt serve --port 8080  # Custom port
```

### Development

```bash
bun dev                 # Starts at localhost:3002
```

### Programmatic

```typescript
import { createServer } from './server';

await createServer(3000);
```

## Server Setup

The server is configured in `src/server/index.ts`:

```typescript
import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { resolve } from 'path';
import { registerPageRoutes, registerApiRoutes } from './routes/index.js';
import { jobTracker } from '../jobs/tracker.js';

export async function createServer(port = 3000) {
  // Initialize job tracker
  await jobTracker.initialize();

  const app = new Elysia().use(html());

  // Serve favicon
  app.get('/favicon.svg', () =>
    Bun.file(resolve(import.meta.dir, '../../public/favicon.svg'))
  );

  registerPageRoutes(app);
  registerApiRoutes(app);

  app.listen(port);
  return app;
}
```

## Page Routes

HTML pages are served from `src/server/routes/pages.ts`:

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Stats overview, users table, quick actions |
| `/scrape` | Scrape | Form to scrape tweets from user |
| `/search` | Search | Topic-based tweet search |
| `/discover` | Discover | Find Twitter profiles |
| `/ask` | Ask | AI Q&A with semantic search |
| `/config` | Config | Edit settings inline |

### Page Structure

Each page follows this pattern:

```typescript
app.get('/scrape', async () => {
  return layout('Scrape', `
    <div class="container">
      ${card('Scrape Tweets', `
        <form hx-post="/api/scrape"
              hx-ext="json-enc"
              hx-target="#result"
              hx-indicator="#scrape-indicator"
              hx-trigger="submit">
          ${formGroup('Username', '<input name="username" required>')}
          ${formGroup('Max Tweets', '<input name="maxTweets" type="number" value="100">')}
          <button type="submit">
            Start Scrape
            <span id="scrape-indicator" class="htmx-indicator"> (scraping...)</span>
          </button>
        </form>
      `)}
      <div id="result"></div>
    </div>
  `);
});
```

## Template System

### Layout

The base layout (`layout.ts`) provides:

- HTML structure
- CSS styles (inline)
- Navigation header
- Job taskbar
- HTMX script

```typescript
export function layout(title: string, content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - XGPT</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
      <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      <script src="https://unpkg.com/htmx-ext-json-enc@2.0.1/json-enc.js"></script>
      <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
      <style>${styles}</style>
    </head>
    <body>
      <div class="container">
        <header>...</header>
        <main>${content}</main>
      </div>
      <div id="taskbar" class="taskbar" hx-ext="sse" sse-connect="/api/jobs/stream" sse-swap="jobs"></div>
      <script>${navScript}</script>
    </body>
    </html>
  `;
}
```

### Components

Reusable components in `components.ts`:

```typescript
// Card with title and content
card(title: string, content: string): string

// Stat card with value and label
statCard(value: number | string, label: string): string

// Result box (success/error/default)
result(content: string, type: 'success' | 'error' | 'default'): string

// Form group with label
formGroup(label: string, inputHtml: string): string

// Table with headers and rows
table(headers: string[], rows: string[][]): string

// Tweet display item
tweetItem(user: string, text: string, similarity?: number): string

// Profile item for discover results
profileItem(profile: ProfileData): string

// User table row
userRow(user: UserData): string

// Job item for taskbar
jobItem(job: JobItemData): string
```

## HTMX Integration

The server uses HTMX for reactivity without JavaScript frameworks:

### Form Submissions

```html
<form hx-post="/api/scrape"
      hx-ext="json-enc"
      hx-target="#scrape-result"
      hx-indicator="#scrape-indicator"
      hx-trigger="submit">
  <input name="username" required>
  <button type="submit">
    Start Scrape
    <span id="scrape-indicator" class="htmx-indicator"> (scraping...)</span>
  </button>
</form>
<div id="scrape-result"></div>
```

### Dynamic Updates

```html
<!-- Job taskbar with SSE -->
<div id="taskbar"
     class="taskbar"
     hx-ext="sse"
     sse-connect="/api/jobs/stream"
     sse-swap="jobs">
</div>
```

## Server-Sent Events (SSE)

Real-time job updates use SSE:

```typescript
app.get('/api/jobs/stream', ({ set }) => {
  set.headers['content-type'] = 'text/event-stream';
  set.headers['cache-control'] = 'no-cache';
  set.headers['connection'] = 'keep-alive';

  const formatSseData = (html: string) => {
    const lines = html.split('\n').filter(line => line.trim());
    return lines.map(line => `data: ${line}`).join('\n');
  };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial state
      const initial = generateJobsHtml(jobTracker.getAllJobs());
      controller.enqueue(
        encoder.encode(`event: jobs\n${formatSseData(initial)}\n\n`)
      );

      // Subscribe to updates
      const unsubscribe = jobTracker.subscribe((jobs) => {
        const html = generateJobsHtml(jobs);
        controller.enqueue(
          encoder.encode(`event: jobs\n${formatSseData(html)}\n\n`)
        );
      });

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 30000);

      return () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
    }
  });

  return new Response(stream);
});
```

## CSS Architecture

Styles are defined inline in `layout.ts`:

```css
:root {
  --bg: #111318;
  --surface: #1a1d24;
  --surface-hover: #252931;
  --border: #32383f;
  --text: #e8e9eb;
  --text-muted: #868c96;
  --primary: #d97706;
  --primary-hover: #b45309;
  --success: #059669;
  --error: #dc2626;
}

/* Dark theme by default */
body {
  background: var(--bg);
  color: var(--text);
}

/* Component styles */
.card { ... }
.result { ... }
.form-group { ... }
.table { ... }
.taskbar { ... }
```

## Job Taskbar

The floating taskbar shows active jobs:

```html
<div id="taskbar" class="taskbar"
     hx-ext="sse"
     sse-connect="/api/jobs/stream"
     sse-swap="jobs">
  <!-- Job items rendered here -->
</div>
```

```css
.taskbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 0.5rem 1.5rem;
  display: none;
  z-index: 1000;
}

.taskbar.has-jobs {
  display: block;
}

.taskbar-content {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.job-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: var(--bg);
  font-size: 0.8rem;
}

.job-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.job-progress {
  width: 80px;
  height: 3px;
  background: var(--border);
  overflow: hidden;
}

.job-progress-bar {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s;
}

.job-done { color: var(--success); }
.job-failed { color: var(--error); }
.job-cancelled { color: var(--text-muted); }
```

## Error Handling

API errors are converted to user-friendly HTML:

```typescript
function handleApiError(error: unknown, set: { status?: number }): string {
  const apiError = toApiError(error);
  set.status = apiError.statusCode;

  const friendlyError = toFriendlyError(error);
  return `<div class="result error">${formatFriendlyErrorHtml(friendlyError)}</div>`;
}
```

## Keyboard Navigation

The header supports Q/E navigation:

```javascript
(function() {
  const routes = ['/', '/scrape', '/search', '/discover', '/ask', '/config'];
  const currentPath = window.location.pathname;
  const currentIndex = routes.findIndex(
    (r) => r === currentPath || (r !== '/' && currentPath.startsWith(r))
  );

  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    const key = e.key.toLowerCase();
    if (key !== 'q' && key !== 'e') return;

    const keyEl = document.getElementById('nav-key-' + key);
    if (keyEl) keyEl.classList.add('pressed');

    if (currentIndex === -1) return;

    const nextIndex = key === 'q'
      ? (currentIndex - 1 + routes.length) % routes.length
      : (currentIndex + 1) % routes.length;

    window.location.href = routes[nextIndex];
  });

  document.addEventListener('keyup', function(e) {
    const key = e.key.toLowerCase();
    if (key === 'q' || key === 'e') {
      const keyEl = document.getElementById('nav-key-' + key);
      if (keyEl) keyEl.classList.remove('pressed');
    }
  });
})();
```

## Static Files

The server currently serves the favicon directly from `public/`:

```typescript
app.get('/favicon.svg', () =>
  Bun.file(resolve(import.meta.dir, '../../public/favicon.svg'))
);
```

## Performance Considerations

1. **Inline CSS** - Avoids extra HTTP requests
2. **HTMX CDN** - Loads from CDN with browser caching
3. **SSE over WebSocket** - Simpler, built-in reconnection
4. **Component functions** - String templates are fast
5. **No JavaScript frameworks** - Minimal client-side overhead

## Related Documentation

- [API Reference](./api-reference.md) - API endpoint details
- [Components](./components.md) - UI component reference
- [Job Tracking](./jobs.md) - Job system and SSE
