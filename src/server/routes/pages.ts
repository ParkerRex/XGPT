/**
 * HTML page routes for XGPT web UI
 */

import { Elysia } from "elysia";
import { checkDatabaseHealth } from "../../database/connection.js";
import { statsQueries, userQueries } from "../../database/queries.js";
import { listConfigCommand } from "../../commands/config.js";
import { layout, statCard, card, userRow, table } from "../templates/index.js";

/**
 * Register all page routes
 */
export function registerPageRoutes(app: Elysia) {
  return (
    app
      // Dashboard
      .get("/", async () => {
        const health = checkDatabaseHealth();
        let stats = { users: 0, tweets: 0, embeddings: 0, sessions: 0 };
        let users: Array<{
          username: string;
          displayName?: string;
          bio?: string;
          location?: string;
          followersCount?: number;
          tweetsCount?: number;
          isVerified?: boolean;
        }> = [];

        try {
          stats = await statsQueries.getOverallStats();
          // Use simple version for backwards compatibility (excludes soft-deleted)
          users = await userQueries.getAllUsersSimple();
        } catch {
          // DB may not be initialized
        }

        const usersTableRows = users.map((u) => userRow(u)).join("");

        return layout(
          "Dashboard",
          `
        <div class="grid grid-4">
          ${statCard(stats.users, "Users")}
          ${statCard(stats.tweets.toLocaleString(), "Tweets")}
          ${statCard(stats.embeddings.toLocaleString(), "Embeddings")}
          ${statCard(stats.sessions, "Sessions")}
        </div>

        <div class="grid grid-2">
          ${card(
            "Quick Actions",
            `
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button hx-post="/api/db/init" hx-target="#quick-result" hx-indicator="#quick-indicator"
                hx-confirm="This will reset the database. All existing data will be lost. Are you sure?">
                Init Database
              </button>
              <button hx-post="/api/embed" hx-ext="json-enc" hx-vals='{}' hx-target="#quick-result" hx-indicator="#quick-indicator">
                Generate Embeddings
              </button>
              <span id="quick-indicator" class="htmx-indicator">Working...</span>
            </div>
            <div id="quick-result"></div>
          `,
          )}

          ${card(
            "Database Health",
            `<div class="result ${health ? "success" : "error"}">
              Status: ${health ? "Healthy" : "Unhealthy"}
            </div>`,
          )}
        </div>

        ${card(
          `Users (${users.length})`,
          users.length > 0
            ? table(
                ["Username", "Bio", "Location", "Followers", "Tweets"],
                [], // We use userRow directly for custom formatting
              ).replace("<tbody></tbody>", `<tbody>${usersTableRows}</tbody>`)
            : '<p style="color: var(--text-muted);">No users yet. Use Discover to find profiles or Scrape to add users.</p>',
        )}
      `,
        );
      })

      // Scrape Page
      .get("/scrape", () => {
        return layout(
          "Scrape",
          card(
            "Scrape Tweets from User",
            `
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
        `,
          ),
        );
      })

      // Search Page
      .get("/search", () => {
        return layout(
          "Search",
          card(
            "Search Tweets by Topic",
            `
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
        `,
          ),
        );
      })

      // Discover Page
      .get("/discover", () => {
        return layout(
          "Discover",
          card(
            "Discover Twitter Profiles",
            `
          <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.875rem;">
            Search for Twitter profiles by bio, name, or keywords. Find users with specific interests or affiliations.
          </p>
          <form hx-post="/api/discover" hx-ext="json-enc" hx-target="#discover-result" hx-indicator="#discover-indicator">
            <div class="form-group">
              <label for="query">Search Query</label>
              <input type="text" id="query" name="query" placeholder="google engineer, AI researcher, indie hacker..." required>
            </div>
            <div class="grid grid-2">
              <div class="form-group">
                <label for="maxResults">Max Results</label>
                <input type="number" id="maxResults" name="maxResults" value="20" min="1" max="10000">
              </div>
              <div class="form-group">
                <div class="checkbox-group" style="margin-top: 1.5rem;">
                  <label><input type="checkbox" name="save" checked> Save to database</label>
                </div>
              </div>
            </div>
            <button type="submit">
              Discover Profiles
              <span id="discover-indicator" class="htmx-indicator"> (searching...)</span>
            </button>
          </form>
          <div id="discover-result"></div>
        `,
          ),
        );
      })

      // Ask Page
      .get("/ask", () => {
        return layout(
          "Ask",
          card(
            "Ask About Tweets",
            `
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
        `,
          ),
        );
      })

      // Config Page
      .get("/config", async () => {
        const configResult = await listConfigCommand();
        const configData = configResult.data || {};

        const renderConfig = (
          obj: Record<string, unknown>,
          prefix = "",
        ): string => {
          return Object.entries(obj)
            .map(([key, value]) => {
              const fullKey = prefix ? `${prefix}.${key}` : key;
              if (
                typeof value === "object" &&
                value !== null &&
                !Array.isArray(value)
              ) {
                return `<div style="margin-left: 1rem;">${renderConfig(value as Record<string, unknown>, fullKey)}</div>`;
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
          card(
            "Configuration",
            `
          <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.875rem;">
            Edit values directly - changes save automatically.
          </p>
          ${renderConfig(configData)}
          <div id="config-result" style="margin-top: 1rem;"></div>
        `,
          ),
        );
      })
  );
}
