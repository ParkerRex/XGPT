/**
 * XGPT Web Server
 * Main server setup and configuration
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { registerPageRoutes, registerApiRoutes } from "./routes/index.js";
import { resolve } from "path";
import { jobTracker } from "../jobs/tracker.js";

/**
 * Create and configure the XGPT web server
 * @param port The port to listen on
 * @returns The configured Elysia app instance
 */
export async function createServer(port = 3000) {
  // Initialize job tracker (loads persisted jobs from database)
  await jobTracker.initialize();

  const app = new Elysia().use(html());

  // Serve favicon
  app.get("/favicon.svg", () =>
    Bun.file(resolve(import.meta.dir, "../../public/favicon.svg")),
  );

  // Register routes
  registerPageRoutes(app);
  registerApiRoutes(app);

  // Start listening
  app.listen(port);

  console.log(`XGPT Web UI running at http://localhost:${port}`);
  return app;
}

// Allow running directly
if (import.meta.main) {
  await createServer(3000);
}
