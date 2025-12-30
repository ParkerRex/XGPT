/**
 * Base HTML layout template for XGPT web UI
 */

const styles = `
  :root {
    --bg: #0a0a0a;
    --surface: #141414;
    --surface-hover: #1a1a1a;
    --border: #262626;
    --text: #fafafa;
    --text-muted: #a1a1a1;
    --primary: #3b82f6;
    --primary-hover: #2563eb;
    --success: #22c55e;
    --error: #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }
  .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
    margin-bottom: 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h1 { font-size: 1.5rem; font-weight: 600; }
  nav { display: flex; gap: 1rem; }
  nav a {
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    transition: all 0.2s;
  }
  nav a:hover, nav a.active {
    background: var(--surface);
    color: var(--text);
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .card h2 {
    font-size: 1rem;
    margin-bottom: 1rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .form-group { margin-bottom: 1rem; }
  label {
    display: block;
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }
  input, select, textarea {
    width: 100%;
    padding: 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    color: var(--text);
    font-family: inherit;
    font-size: 0.875rem;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
  button {
    padding: 0.75rem 1.5rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-family: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  button:hover { background: var(--primary-hover); }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover { background: var(--surface-hover); }
  .grid { display: grid; gap: 1.5rem; }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  @media (max-width: 768px) {
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
  }
  .stat {
    text-align: center;
    padding: 1rem;
  }
  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--primary);
  }
  .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .result {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
    margin-top: 1rem;
    white-space: pre-wrap;
    font-size: 0.875rem;
    max-height: 400px;
    overflow-y: auto;
  }
  .result.success { border-color: var(--success); }
  .result.error { border-color: var(--error); }
  .tweet {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
  }
  .tweet:last-child { border-bottom: none; }
  .tweet-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .tweet-text { font-size: 0.875rem; }
  .similarity {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    background: var(--primary);
    border-radius: 1rem;
    font-size: 0.75rem;
  }
  .htmx-indicator {
    display: none;
    color: var(--text-muted);
  }
  .htmx-request .htmx-indicator { display: inline; }
  .htmx-request button { opacity: 0.7; }
  .inline-form {
    display: flex;
    gap: 0.5rem;
  }
  .inline-form input { flex: 1; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    font-size: 0.75rem;
  }
  tr:hover {
    background: var(--surface-hover);
  }
  .verified-badge {
    color: var(--primary);
    font-size: 0.75rem;
  }
  .bio-text {
    color: var(--text-muted);
    font-size: 0.8rem;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .taskbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 0.75rem 2rem;
    display: none;
    z-index: 1000;
  }
  .taskbar.has-jobs {
    display: block;
  }
  .taskbar-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .job-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: var(--bg);
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }
  .job-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  .job-done {
    color: var(--success);
  }
  .job-failed {
    color: var(--error);
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .job-progress {
    width: 100px;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .job-progress-bar {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s;
  }
  .checkbox-group {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  .checkbox-group input[type="checkbox"] {
    width: auto;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1rem;
  }
  .tab {
    padding: 0.75rem 1rem;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
  }
  .tab:hover { color: var(--text); }
  .tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
  }
  .hidden { display: none; }
`;

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/scrape", label: "Scrape" },
  { href: "/search", label: "Search" },
  { href: "/discover", label: "Discover" },
  { href: "/ask", label: "Ask" },
  { href: "/config", label: "Config" },
];

/**
 * Render the base HTML layout with navigation and content
 */
export function layout(title: string, content: string): string {
  const navHtml = navItems
    .map(
      (item) =>
        `<a href="${item.href}" class="${title === item.label ? "active" : ""}">${item.label}</a>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - XGPT</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://unpkg.com/htmx-ext-json-enc@2.0.1/json-enc.js"></script>
  <style>${styles}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1><a href="/" style="color: inherit; text-decoration: none;">XGPT</a></h1>
      <nav>${navHtml}</nav>
    </header>
    <main>${content}</main>
  </div>
  <div id="taskbar" class="taskbar" hx-get="/api/jobs" hx-trigger="load, every 2s" hx-swap="innerHTML">
  </div>
</body>
</html>
`;
}
