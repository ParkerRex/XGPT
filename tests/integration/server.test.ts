/**
 * Integration tests for XGPT web UI server routes and API endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import {
  registerPageRoutes,
  registerApiRoutes,
} from "../../src/server/routes/index.js";

const TEST_DB_PATH = "./test_server_tweets.db";

/**
 * Create a test server instance without starting it
 * Uses Elysia's .handle() method for testing
 */
function createTestApp() {
  const app = new Elysia().use(html());
  registerPageRoutes(app);
  registerApiRoutes(app);
  return app;
}

/**
 * Helper to make requests to the test app
 */
async function request(
  app: Elysia,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `http://localhost${path}`;
  return app.handle(new Request(url, options));
}

/**
 * Helper to make JSON POST requests
 */
async function postJson(
  app: Elysia,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return request(app, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Web UI Integration Tests", () => {
  let app: Elysia;

  beforeAll(async () => {
    // Set up test environment
    process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
    process.env.NODE_ENV = "test";

    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }

    // Ensure test directories exist
    if (!existsSync("./tests/temp")) {
      await mkdir("./tests/temp", { recursive: true });
    }

    // Create app instance
    app = createTestApp();
  });

  afterAll(async () => {
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }
  });

  describe("Page Routes", () => {
    it("should render dashboard page at /", async () => {
      const response = await request(app, "/");

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Dashboard");
      expect(html).toContain("XGPT");
      // Should have stat cards
      expect(html).toContain("Users");
      expect(html).toContain("Tweets");
      expect(html).toContain("Embeddings");
      expect(html).toContain("Sessions");
    });

    it("should render scrape page at /scrape", async () => {
      const response = await request(app, "/scrape");

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Scrape");
      expect(html).toContain("Scrape Tweets from User");
      expect(html).toContain("Username");
      expect(html).toContain("Max Tweets");
      expect(html).toContain('name="username"');
      expect(html).toContain('hx-post="/api/scrape"');
    });

    it("should render search page at /search", async () => {
      const response = await request(app, "/search");

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Search");
      expect(html).toContain("Search Tweets by Topic");
      expect(html).toContain("Search Query");
      expect(html).toContain('name="query"');
      expect(html).toContain('hx-post="/api/search"');
    });

    it("should render discover page at /discover", async () => {
      const response = await request(app, "/discover");

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Discover");
      expect(html).toContain("Discover Twitter Profiles");
      expect(html).toContain('hx-post="/api/discover"');
    });

    it("should render ask page at /ask", async () => {
      const response = await request(app, "/ask");

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Ask");
      expect(html).toContain("Ask About Tweets");
      expect(html).toContain("Your Question");
      expect(html).toContain('name="question"');
      expect(html).toContain('hx-post="/api/ask"');
    });

    it("should render config page at /config", async () => {
      const response = await request(app, "/config");

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Config");
      expect(html).toContain("Configuration");
    });

    it("should include HTMX and SSE in layout", async () => {
      const response = await request(app, "/");

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("htmx.org");
      expect(html).toContain("sse.js");
    });

    it("should include navigation links in all pages", async () => {
      const pages = ["/", "/scrape", "/search", "/discover", "/ask", "/config"];

      for (const page of pages) {
        const response = await request(app, page);
        const html = await response.text();

        expect(html).toContain('href="/"');
        expect(html).toContain('href="/scrape"');
        expect(html).toContain('href="/search"');
        expect(html).toContain('href="/discover"');
        expect(html).toContain('href="/ask"');
        expect(html).toContain('href="/config"');
      }
    });
  });

  describe("API Routes - Jobs", () => {
    it("should return jobs list at GET /api/jobs", async () => {
      const response = await request(app, "/api/jobs");

      expect(response.status).toBe(200);
      const html = await response.text();
      // Should return HTML (either jobs or empty state)
      expect(html).toContain("script");
    });

    it("should return 404 for non-existent job cancellation", async () => {
      const response = await request(app, "/api/jobs/non-existent-id/cancel", {
        method: "POST",
      });

      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("not found");
    });

    it("should return SSE stream at GET /api/jobs/stream", async () => {
      const response = await request(app, "/api/jobs/stream");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );

      // Read just the first chunk to verify SSE format
      const reader = response.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text).toContain("event: jobs");
        expect(text).toContain("data:");
        reader.releaseLock();
      }
    });
  });

  describe("API Routes - Database", () => {
    it("should initialize database at POST /api/db/init", async () => {
      const response = await request(app, "/api/db/init", { method: "POST" });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("success");
    });
  });

  describe("API Routes - Config", () => {
    it("should set config value at POST /api/config/set", async () => {
      const response = await postJson(app, "/api/config/set", {
        key: "scraping.rateLimitProfile",
        value: "conservative",
      });

      // Config setting may succeed or fail depending on validation
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        const html = await response.text();
        expect(html.toLowerCase()).toContain("saved");
      }
    });

    it("should handle invalid config key", async () => {
      const response = await postJson(app, "/api/config/set", {
        key: "invalid.key.that.does.not.exist",
        value: "some-value",
      });

      // Should either succeed (some configs are dynamic) or return error
      const status = response.status;
      expect([200, 400]).toContain(status);
    });
  });

  describe("API Routes - Error Handling", () => {
    it("should return proper error for missing required fields in /api/scrape", async () => {
      const response = await postJson(app, "/api/scrape", {});

      // Should fail validation
      expect(response.status).toBe(422); // Elysia validation error
    });

    it("should return proper error for missing required fields in /api/search", async () => {
      const response = await postJson(app, "/api/search", {});

      expect(response.status).toBe(422);
    });

    it("should return proper error for missing required fields in /api/discover", async () => {
      const response = await postJson(app, "/api/discover", {});

      expect(response.status).toBe(422);
    });

    it("should return proper error for missing required fields in /api/ask", async () => {
      const response = await postJson(app, "/api/ask", {});

      expect(response.status).toBe(422);
    });

    // Note: The following tests verify that requests pass Elysia's TypeBox validation
    // They are skipped because they actually call the real Twitter API which is slow.
    // These should be moved to e2e tests with proper mocking.
    // To verify validation works, we check that proper fields don't return 422.

    it.skip("should accept requests with required fields for /api/scrape (calls real API)", async () => {
      const response = await postJson(app, "/api/scrape", {
        username: "testuser",
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should accept requests with required fields for /api/search (calls real API)", async () => {
      const response = await postJson(app, "/api/search", {
        query: "test query",
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should accept requests with required fields for /api/discover (calls real API)", async () => {
      const response = await postJson(app, "/api/discover", {
        query: "test query",
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should accept requests with required fields for /api/ask (calls real API)", async () => {
      const response = await postJson(app, "/api/ask", {
        question: "test question",
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should return JSON error when Accept: application/json header is set (calls real API)", async () => {
      const response = await request(app, "/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ username: "testuser" }),
      });

      if (response.status >= 400) {
        const contentType = response.headers.get("content-type");
        expect(
          contentType?.includes("application/json") ||
            contentType?.includes("text/html"),
        ).toBe(true);
      }
    });
  });

  describe("API Routes - Request Validation", () => {
    // Note: Tests marked with .skip call real external APIs.
    // They verify validation passes but are slow due to actual API calls.

    it.skip("should handle optional parameters in /api/scrape (calls real API)", async () => {
      const response = await postJson(app, "/api/scrape", {
        username: "testuser",
        maxTweets: 50,
        includeReplies: true,
        includeRetweets: false,
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should handle optional parameters in /api/search (calls real API)", async () => {
      const response = await postJson(app, "/api/search", {
        query: "test",
        maxTweets: 50,
        days: 7,
        mode: "latest",
        embed: true,
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should handle optional parameters in /api/discover (calls real API)", async () => {
      const response = await postJson(app, "/api/discover", {
        query: "test",
        maxResults: 10,
        save: false,
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should handle optional parameters in /api/ask (calls real API)", async () => {
      const response = await postJson(app, "/api/ask", {
        question: "test question",
        topK: 3,
        model: "gpt-4o-mini",
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should handle string numbers in /api/scrape (calls real API)", async () => {
      const response = await postJson(app, "/api/scrape", {
        username: "testuser",
        maxTweets: "100",
      });
      expect(response.status).not.toBe(422);
    });

    it.skip("should handle embed endpoint at POST /api/embed (calls real API)", async () => {
      const response = await postJson(app, "/api/embed", {});
      expect(response.status).not.toBe(422);
    });

    it.skip("should handle embed with parameters (calls real API)", async () => {
      const response = await postJson(app, "/api/embed", {
        model: "text-embedding-3-small",
        batchSize: 500,
      });
      expect(response.status).not.toBe(422);
    });
  });

  describe("Static Assets", () => {
    it("should serve favicon", async () => {
      const response = await request(app, "/favicon.svg");

      // May be 200 or 404 depending on file existence
      expect([200, 404]).toContain(response.status);
    });
  });

  describe("Response Format", () => {
    it("should return HTML content type for page routes", async () => {
      const pages = ["/", "/scrape", "/search", "/discover", "/ask", "/config"];

      for (const page of pages) {
        const response = await request(app, page);
        const contentType = response.headers.get("content-type");
        expect(contentType).toContain("text/html");
      }
    });

    it("should return properly formatted HTML structure", async () => {
      const response = await request(app, "/");
      const html = await response.text();

      // Check for proper HTML structure
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("<head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</html>");
    });

    it("should include CSS styles in layout", async () => {
      const response = await request(app, "/");
      const html = await response.text();

      expect(html).toContain("<style>");
      expect(html).toContain("--primary");
      expect(html).toContain("--bg"); // CSS uses --bg for background
    });

    it("should include taskbar for job tracking", async () => {
      const response = await request(app, "/");
      const html = await response.text();

      expect(html).toContain('id="taskbar"');
      expect(html).toContain("sse-connect");
    });
  });
});

describe("Web UI Error Scenarios", () => {
  let app: Elysia;

  beforeAll(() => {
    app = createTestApp();
  });

  it("should handle 404 for unknown routes", async () => {
    const response = await request(app, "/unknown-route");

    expect(response.status).toBe(404);
  });

  it("should handle invalid HTTP methods", async () => {
    // GET request to POST-only endpoint
    const response = await request(app, "/api/scrape", { method: "GET" });

    expect(response.status).toBe(404);
  });

  it("should handle malformed JSON in POST requests", async () => {
    const response = await request(app, "/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json }",
    });

    expect(response.status).toBe(400);
  });
});
