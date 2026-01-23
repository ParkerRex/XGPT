# UI Components

X-GPT's web UI uses a component-based template system for consistent, reusable UI elements. Components are server-rendered HTML functions that integrate with HTMX for interactivity.

## Overview

Components are located in `src/server/templates/`:

```
src/server/templates/
  layout.ts       # Base HTML layout with CSS
  components.ts   # Reusable UI components
  index.ts        # Exports
```

## Layout

The `layout` function wraps all pages with consistent structure:

```typescript
import { layout } from './templates';

app.get('/page', () => {
  return layout('Page Title', `
    <!-- Page content -->
  `);
});
```

### Layout Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - XGPT</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://unpkg.com/htmx-ext-json-enc@2.0.1/json-enc.js"></script>
  <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
  <style>{styles}</style>
</head>
<body>
  <div class="container">
    <header>...</header>
    <main>{content}</main>
  </div>
  <div id="taskbar" class="taskbar" hx-ext="sse" sse-connect="/api/jobs/stream" sse-swap="jobs"></div>
  <script>{keyboard navigation script}</script>
</body>
</html>
```

## Card Component

Display content in a styled card:

```typescript
import { card } from './templates';

card('Card Title', `
  <p>Card content here</p>
  <button>Action</button>
`);
```

**Output:**
```html
<div class="card">
  <h2>Card Title</h2>
  <p>Card content here</p>
  <button>Action</button>
</div>
```

## Stat Card Component

Display a statistic with label:

```typescript
import { statCard } from './templates';

statCard(1234, 'Total Tweets');
statCard('Active', 'Status');
```

**Output:**
```html
<div class="card">
  <div class="stat">
    <div class="stat-value">1,234</div>
    <div class="stat-label">Total Tweets</div>
  </div>
</div>
```

## Result Component

Display operation results (success/error/default):

```typescript
import { result } from './templates';

result('Operation completed successfully!', 'success');
result('Something went wrong', 'error');
result('Processing...', 'default');
```

**Output:**
```html
<div class="result success">Operation completed successfully!</div>
<div class="result error">Something went wrong</div>
<div class="result">Processing...</div>
```

## Form Group Component

Create form fields with labels:

```typescript
import { formGroup } from './templates';

formGroup('Username', '<input name="username" required>');
formGroup('Max Tweets', '<input name="maxTweets" type="number" value="100">');
formGroup('Include Replies', '<input name="replies" type="checkbox">');
```

**Output:**
```html
<div class="form-group">
  <label>Username</label>
  <input name="username" required>
</div>
```

## Table Component

Render data in a table:

```typescript
import { table } from './templates';

table(
  ['Username', 'Tweets', 'Followers'],
  [
    ['@elonmusk', '5,234', '180M'],
    ['@BillGates', '3,456', '62M'],
    ['@naval', '12,345', '2M']
  ]
);
```

**Output:**
```html
<div style="overflow-x: auto;">
  <table>
    <thead>
      <tr>
        <th>Username</th>
        <th>Tweets</th>
        <th>Followers</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>@elonmusk</td>
        <td>5,234</td>
        <td>180M</td>
      </tr>
      ...
    </tbody>
  </table>
</div>
```

## Tweet Item Component

Display a tweet with optional similarity score:

```typescript
import { tweetItem } from './templates';

tweetItem('elonmusk', 'AI will transform everything', 0.952);
tweetItem('naval', 'Seek wealth, not money');
```

**Output:**
```html
<div class="tweet">
  <div class="tweet-header">
    <span>@elonmusk</span>
    <span class="similarity">95.2% match</span>
  </div>
  <div class="tweet-text">AI will transform everything</div>
</div>
```

## Profile Item Component

Display a discovered user profile:

```typescript
import { profileItem } from './templates';

profileItem({
  username: 'elonmusk',
  name: 'Elon Musk',
  bio: 'Mars & Cars, Chips & Dips',
  followers: 180000000,
  verified: true,
  location: 'Austin, TX'
});
```

**Output:**
```html
<div class="tweet">
  <div class="tweet-header">
    <span><strong>@elonmusk</strong> [verified]</span>
    <span class="similarity">180M followers</span>
  </div>
  <div class="tweet-text">
    <strong>Elon Musk</strong><br>
    Mars & Cars, Chips & Dips
    <br><span style="color: var(--text-muted);">Location: Austin, TX</span>
  </div>
</div>
```

## User Row Component

Display a user in a table row:

```typescript
import { userRow } from './templates';

userRow({
  username: 'elonmusk',
  displayName: 'Elon Musk',
  bio: 'Mars & Cars, Chips & Dips',
  location: 'Austin, TX',
  followersCount: 180000000,
  tweetsCount: 5234,
  isVerified: true
});
```

**Output:**
```html
<tr>
  <td>
    <strong>@elonmusk</strong>
    <span class="verified-badge">[verified]</span>
    <br><span style="color: var(--text-muted);">Elon Musk</span>
  </td>
  <td class="bio-text" title="Mars & Cars...">Mars & Cars...</td>
  <td>Austin, TX</td>
  <td>180M</td>
  <td>5.2K</td>
</tr>
```

## Job Item Component

Display a job in the taskbar:

```typescript
import { jobItem } from './templates';

jobItem({
  id: 'scrape-1704067200000',
  type: 'scrape',
  status: 'running',
  progress: { current: 50, total: 100, message: 'Fetching tweets...' },
  duration: '2m 30s'
});
```

**Output:**
```html
<div class="job-item">
  <div class="job-spinner"></div>
  <span><strong>scrape</strong></span>
  <span>Fetching tweets...</span>
  <div class="job-progress">
    <div class="job-progress-bar" style="width: 50%"></div>
  </div>
  <span>50/100</span>
  <span style="color: var(--text-muted)">2m 30s</span>
  <button class="job-cancel-btn" hx-post="/api/jobs/scrape-1704067200000/cancel">×</button>
</div>
```

### Job Status Icons

| Status | Display |
|--------|---------|
| `running` | Spinning loader |
| `completed` | "Done" (green) |
| `failed` | "Failed" (red) |
| `cancelled` | "Cancelled" (yellow) |

## CSS Variables

Components use CSS variables for theming:

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
```

## Component Styles

### Card Styles

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 1rem;
  margin-bottom: 1rem;
}

.card h2 {
  font-size: 0.8rem;
  margin-bottom: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

### Result Styles

```css
.result {
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 0.75rem;
  margin-top: 0.75rem;
  white-space: pre-wrap;
  font-size: 0.8rem;
  max-height: 400px;
  overflow-y: auto;
}

.result.success {
  border-color: var(--success);
}

.result.error {
  border-color: var(--error);
}
```

### Form Styles

```css
.form-group {
  margin-bottom: 0.75rem;
}

label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

input,
select,
textarea {
  width: 100%;
  padding: 0.5rem;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: inherit;
  font-size: 0.8rem;
}
```

### Table Styles

```css
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

th, td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

th {
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  font-size: 0.7rem;
}
```

## HTMX Integration

Components are designed for HTMX interactivity:

### Form with HTMX

```typescript
card('Scrape', `
  <form hx-post="/api/scrape"
        hx-ext="json-enc"
        hx-target="#scrape-result"
        hx-indicator="#scrape-indicator"
        hx-trigger="submit">
    ${formGroup('Username', '<input name="username" required>')}
    <button type="submit">
      Start Scrape
      <span id="scrape-indicator" class="htmx-indicator"> (scraping...)</span>
    </button>
  </form>
  <div id="scrape-result"></div>
`);
```

### Taskbar with SSE

```html
<div id="taskbar" class="taskbar"
     hx-ext="sse"
     sse-connect="/api/jobs/stream"
     sse-swap="jobs">
</div>
```

## Creating Custom Components

Follow this pattern for new components:

```typescript
// src/server/templates/components.ts

export interface MyComponentProps {
  title: string;
  value: number;
  type?: 'primary' | 'secondary';
}

export function myComponent(props: MyComponentProps): string {
  const { title, value, type = 'primary' } = props;

  return `
    <div class="my-component my-component--${type}">
      <h3>${title}</h3>
      <span class="value">${value.toLocaleString()}</span>
    </div>
  `;
}
```

Add corresponding CSS:

```css
.my-component {
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
}

.my-component--primary {
  border-left: 4px solid var(--primary);
}

.my-component--secondary {
  border-left: 4px solid var(--text-muted);
}

.my-component .value {
  font-size: 1.5rem;
  font-weight: bold;
}
```

## Best Practices

1. **Use semantic HTML** - Proper heading levels, labels, etc.
2. **Escape user content** - Prevent XSS by escaping dynamic content
3. **Keep components pure** - No side effects, just return HTML strings
4. **Use CSS variables** - Maintain consistent theming
5. **Add HTMX attributes** - Enable interactivity where needed
6. **Include accessibility** - ARIA labels, title attributes, etc.

## Related Documentation

- [Server Architecture](./server.md) - Server-side rendering
- [API Reference](./api-reference.md) - API endpoints for HTMX
- [Job Tracking](./jobs.md) - Taskbar implementation
