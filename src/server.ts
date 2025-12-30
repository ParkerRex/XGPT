import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { scrapeCommand } from "./commands/scrape.js";
import { embedCommand } from "./commands/embed.js";
import { askCommand } from "./commands/ask.js";
import { searchCommand } from "./commands/search.js";
import {
  listConfigCommand,
  getConfigCommand,
  setConfigCommand,
} from "./commands/config.js";
import {
  initializeDatabase,
  checkDatabaseHealth,
} from "./database/connection.js";
import { statsQueries } from "./database/queries.js";

// HTML template helper
const layout = (title: string, content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - XGPT</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://unpkg.com/htmx-ext-json-enc@2.0.1/json-enc.js"></script>
  <style>
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
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>XGPT</h1>
      <nav>
        <a href="/" class="${title === "Dashboard" ? "active" : ""}">Dashboard</a>
        <a href="/scrape" class="${title === "Scrape" ? "active" : ""}">Scrape</a>
        <a href="/search" class="${title === "Search" ? "active" : ""}">Search</a>
        <a href="/ask" class="${title === "Ask" ? "active" : ""}">Ask</a>
        <a href="/config" class="${title === "Config" ? "active" : ""}">Config</a>
      </nav>
    </header>
    <main>${content}</main>
  </div>
</body>
</html>
`;

export function createServer(port = 3000) {
  const app = new Elysia()
    .use(html())

    // Dashboard
    .get("/", async () => {
      const health = checkDatabaseHealth();
      let stats = { users: 0, tweets: 0, embeddings: 0, sessions: 0 };
      try {
        stats = await statsQueries.getOverallStats();
      } catch (e) {
        // DB may not be initialized
      }

      return layout(
        "Dashboard",
        `
        <div class="grid grid-4">
          <div class="card">
            <div class="stat">
              <div class="stat-value">${stats.users}</div>
              <div class="stat-label">Users</div>
            </div>
          </div>
          <div class="card">
            <div class="stat">
              <div class="stat-value">${stats.tweets.toLocaleString()}</div>
              <div class="stat-label">Tweets</div>
            </div>
          </div>
          <div class="card">
            <div class="stat">
              <div class="stat-value">${stats.embeddings.toLocaleString()}</div>
              <div class="stat-label">Embeddings</div>
            </div>
          </div>
          <div class="card">
            <div class="stat">
              <div class="stat-value">${stats.sessions}</div>
              <div class="stat-label">Sessions</div>
            </div>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="card">
            <h2>Quick Actions</h2>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button hx-post="/api/db/init" hx-target="#quick-result" hx-indicator="#quick-indicator">
                Init Database
              </button>
              <button hx-post="/api/embed" hx-ext="json-enc" hx-vals='{}' hx-target="#quick-result" hx-indicator="#quick-indicator">
                Generate Embeddings
              </button>
              <span id="quick-indicator" class="htmx-indicator">Working...</span>
            </div>
            <div id="quick-result"></div>
          </div>

          <div class="card">
            <h2>Database Health</h2>
            <div class="result ${health ? "success" : "error"}">
              Status: ${health ? "Healthy" : "Unhealthy"}
            </div>
          </div>
        </div>
      `,
      );
    })

    // Scrape Page
    .get("/scrape", () => {
      return layout(
        "Scrape",
        `
        <div class="card">
          <h2>Scrape Tweets from User</h2>
          <form hx-post="/api/scrape" hx-ext="json-enc" hx-target="#scrape-result" hx-indicator="#scrape-indicator">
            <div class="grid grid-2">
              <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" placeholder="elonmusk" required>
              </div>
              <div class="form-group">
                <label for="maxTweets">Max Tweets</label>
                <input type="number" id="maxTweets" name="maxTweets" value="100" min="1" max="10000">
              </div>
            </div>
            <div class="form-group">
              <div class="checkbox-group">
                <label><input type="checkbox" name="includeReplies"> Include Replies</label>
                <label><input type="checkbox" name="includeRetweets"> Include Retweets</label>
              </div>
            </div>
            <button type="submit">
              Start Scraping
              <span id="scrape-indicator" class="htmx-indicator"> (scraping...)</span>
            </button>
          </form>
          <div id="scrape-result"></div>
        </div>
      `,
      );
    })

    // Search Page
    .get("/search", () => {
      return layout(
        "Search",
        `
        <div class="card">
          <h2>Search Tweets by Topic</h2>
          <form hx-post="/api/search" hx-ext="json-enc" hx-target="#search-result" hx-indicator="#search-indicator">
            <div class="form-group">
              <label for="query">Search Query (comma-separated terms)</label>
              <input type="text" id="query" name="query" placeholder="AGI, GPT-5, artificial intelligence" required>
            </div>
            <div class="grid grid-3">
              <div class="form-group">
                <label for="maxTweets">Max Tweets</label>
                <input type="number" id="maxTweets" name="maxTweets" value="100" min="1" max="500">
              </div>
              <div class="form-group">
                <label for="days">Last N Days (optional)</label>
                <input type="number" id="days" name="days" placeholder="7">
              </div>
              <div class="form-group">
                <label for="mode">Mode</label>
                <select id="mode" name="mode">
                  <option value="latest">Latest</option>
                  <option value="top">Top</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <div class="checkbox-group">
                <label><input type="checkbox" name="embed"> Auto-embed results</label>
              </div>
            </div>
            <button type="submit">
              Search
              <span id="search-indicator" class="htmx-indicator"> (searching...)</span>
            </button>
          </form>
          <div id="search-result"></div>
        </div>
      `,
      );
    })

    // Ask Page
    .get("/ask", () => {
      return layout(
        "Ask",
        `
        <div class="card">
          <h2>Ask About Tweets</h2>
          <form hx-post="/api/ask" hx-ext="json-enc" hx-target="#ask-result" hx-indicator="#ask-indicator">
            <div class="form-group">
              <label for="question">Your Question</label>
              <textarea id="question" name="question" rows="3" placeholder="What are the main themes discussed?" required></textarea>
            </div>
            <div class="grid grid-2">
              <div class="form-group">
                <label for="topK">Number of relevant tweets</label>
                <input type="number" id="topK" name="topK" value="5" min="1" max="20">
              </div>
              <div class="form-group">
                <label for="model">Model</label>
                <select id="model" name="model">
                  <option value="gpt-4o-mini">gpt-4o-mini (fast)</option>
                  <option value="gpt-4o">gpt-4o (better)</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                </select>
              </div>
            </div>
            <button type="submit">
              Ask
              <span id="ask-indicator" class="htmx-indicator"> (thinking...)</span>
            </button>
          </form>
          <div id="ask-result"></div>
        </div>
      `,
      );
    })

    // Config Page
    .get("/config", async () => {
      const configResult = await listConfigCommand();
      const configData = configResult.data || {};

      const renderConfig = (obj: any, prefix = ""): string => {
        return Object.entries(obj)
          .map(([key, value]) => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value)
            ) {
              return `<div style="margin-left: 1rem;">${renderConfig(value, fullKey)}</div>`;
            }
            return `
              <div class="form-group" style="display: flex; align-items: center; gap: 1rem;">
                <label style="min-width: 200px; margin: 0;">${fullKey}</label>
                <input type="text" value="${value}" style="flex: 1;"
                  hx-post="/api/config/set"
                  hx-ext="json-enc"
                  hx-vals='{"key": "${fullKey}"}'
                  hx-trigger="change"
                  hx-target="#config-result"
                  name="value"
                >
              </div>
            `;
          })
          .join("");
      };

      return layout(
        "Config",
        `
        <div class="card">
          <h2>Configuration</h2>
          <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.875rem;">
            Edit values directly - changes save automatically.
          </p>
          ${renderConfig(configData)}
          <div id="config-result" style="margin-top: 1rem;"></div>
        </div>
      `,
      );
    })

    // API Routes
    .post(
      "/api/scrape",
      async ({ body }) => {
        try {
          const result = await scrapeCommand({
            username: body.username,
            includeReplies: body.includeReplies || false,
            includeRetweets: body.includeRetweets || false,
            maxTweets: body.maxTweets || 100,
          });

          if (result.success) {
            return `<div class="result success">
              <strong>Success!</strong><br>
              Collected ${result.data?.tweetsCollected || 0} tweets<br>
              Session ID: ${result.data?.sessionId || "N/A"}
            </div>`;
          }
          return `<div class="result error">${result.error || result.message}</div>`;
        } catch (e: any) {
          return `<div class="result error">Error: ${e.message}</div>`;
        }
      },
      {
        body: t.Object({
          username: t.String(),
          includeReplies: t.Optional(t.Boolean()),
          includeRetweets: t.Optional(t.Boolean()),
          maxTweets: t.Optional(t.Number()),
        }),
      },
    )

    .post(
      "/api/search",
      async ({ body }) => {
        try {
          const result = await searchCommand({
            query: body.query,
            maxTweets: body.maxTweets || 100,
            days: body.days,
            mode: body.mode as "latest" | "top",
            embed: body.embed || false,
          });

          if (result.success) {
            return `<div class="result success">
              <strong>Success!</strong><br>
              Collected ${result.data?.tweetsCollected || 0} tweets<br>
              Users created: ${result.data?.usersCreated || 0}<br>
              Session ID: ${result.data?.sessionId || "N/A"}
              ${result.data?.embeddingsGenerated ? "<br>Embeddings generated!" : ""}
            </div>`;
          }
          return `<div class="result error">${result.error || result.message}</div>`;
        } catch (e: any) {
          return `<div class="result error">Error: ${e.message}</div>`;
        }
      },
      {
        body: t.Object({
          query: t.String(),
          maxTweets: t.Optional(t.Number()),
          days: t.Optional(t.Number()),
          mode: t.Optional(t.String()),
          embed: t.Optional(t.Boolean()),
        }),
      },
    )

    .post(
      "/api/ask",
      async ({ body }) => {
        try {
          const result = await askCommand({
            question: body.question,
            topK: body.topK || 5,
            model: body.model || "gpt-4o-mini",
          });

          if (result.success && result.data) {
            const tweets = result.data.relevantTweets || [];
            const tweetsHtml = tweets
              .map(
                (t: any) => `
              <div class="tweet">
                <div class="tweet-header">
                  <span>@${t.user || "unknown"}</span>
                  <span class="similarity">${(t.similarity * 100).toFixed(1)}% match</span>
                </div>
                <div class="tweet-text">${t.text}</div>
              </div>
            `,
              )
              .join("");

            return `
              <div class="result success">
                <strong>Answer:</strong><br><br>
                ${result.data.answer}
              </div>
              <div class="card" style="margin-top: 1rem;">
                <h2>Relevant Tweets (${tweets.length})</h2>
                ${tweetsHtml}
              </div>
            `;
          }
          return `<div class="result error">${result.error || result.message}</div>`;
        } catch (e: any) {
          return `<div class="result error">Error: ${e.message}</div>`;
        }
      },
      {
        body: t.Object({
          question: t.String(),
          topK: t.Optional(t.Number()),
          model: t.Optional(t.String()),
        }),
      },
    )

    .post(
      "/api/embed",
      async ({ body }) => {
        try {
          const result = await embedCommand({
            model: body.model || "text-embedding-3-small",
            batchSize: body.batchSize || 1000,
          });

          if (result.success) {
            return `<div class="result success">
              <strong>Success!</strong><br>
              Embedded ${result.data?.tweetsEmbedded || 0} tweets<br>
              Model: ${result.data?.model || "N/A"}
            </div>`;
          }
          return `<div class="result error">${result.error || result.message}</div>`;
        } catch (e: any) {
          return `<div class="result error">Error: ${e.message}</div>`;
        }
      },
      {
        body: t.Object({
          model: t.Optional(t.String()),
          batchSize: t.Optional(t.Number()),
        }),
      },
    )

    .post("/api/db/init", async () => {
      try {
        await initializeDatabase();
        return `<div class="result success">Database initialized successfully!</div>`;
      } catch (e: any) {
        return `<div class="result error">Error: ${e.message}</div>`;
      }
    })

    .post(
      "/api/config/set",
      async ({ body }) => {
        try {
          const result = await setConfigCommand(body.key, body.value);
          if (result.success) {
            return `<div class="result success" style="padding: 0.5rem;">Saved!</div>`;
          }
          return `<div class="result error" style="padding: 0.5rem;">${result.error}</div>`;
        } catch (e: any) {
          return `<div class="result error" style="padding: 0.5rem;">Error: ${e.message}</div>`;
        }
      },
      {
        body: t.Object({
          key: t.String(),
          value: t.String(),
        }),
      },
    )

    .listen(port);

  console.log(`XGPT Web UI running at http://localhost:${port}`);
  return app;
}

// Allow running directly
if (import.meta.main) {
  createServer(3000);
}
