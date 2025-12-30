/**
 * Base HTML layout template for XGPT web UI
 */

const styles = `
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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg);
    color: var(--text);
    line-height: 1.4;
    min-height: 100vh;
    font-size: 13px;
  }
  .container { width: 100%; padding: 1rem 1.5rem; }
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h1 { font-size: 1.25rem; font-weight: 600; }
  nav { display: flex; gap: 0.5rem; }
  nav a {
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.375rem 0.75rem;
    transition: all 0.2s;
  }
  nav a:hover, nav a.active {
    background: var(--surface);
    color: var(--text);
  }
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
  .form-group { margin-bottom: 0.75rem; }
  label {
    display: block;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }
  input, select, textarea {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: inherit;
    font-size: 0.8rem;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
  button {
    padding: 0.5rem 1rem;
    background: var(--primary);
    color: white;
    border: none;
    font-family: inherit;
    font-size: 0.8rem;
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
  .grid { display: grid; gap: 1rem; }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  @media (max-width: 768px) {
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
  }
  .stat {
    text-align: center;
    padding: 0.5rem;
  }
  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--primary);
  }
  .stat-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
  }
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
  .result.success { border-color: var(--success); }
  .result.error { border-color: var(--error); }
  .tweet {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  .tweet:last-child { border-bottom: none; }
  .tweet-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.375rem;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .tweet-text { font-size: 0.8rem; }
  .similarity {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: var(--primary);
    font-size: 0.7rem;
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
    margin-bottom: 0.75rem;
  }
  .tab {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
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
