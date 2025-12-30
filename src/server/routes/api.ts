/**
 * API routes for XGPT web UI
 */

import { Elysia, t } from "elysia";
import { scrapeCommand } from "../../commands/scrape.js";
import { embedCommand } from "../../commands/embed.js";
import { askCommand } from "../../commands/ask.js";
import { searchCommand } from "../../commands/search.js";
import { discoverCommand } from "../../commands/users.js";
import { setConfigCommand } from "../../commands/config.js";
import { initializeDatabase } from "../../database/connection.js";
import { jobTracker, type Job } from "../../jobs/index.js";
import {
  result,
  card,
  tweetItem,
  profileItem,
  jobItem,
} from "../templates/index.js";
import { formatDuration } from "../../utils/format.js";
import { toApiError, type ApiErrorResponse } from "../../errors/index.js";

/**
 * Standardized error handler for API endpoints
 * Returns HTML for web UI or JSON based on Accept header
 */
function handleApiError(
  error: unknown,
  set: { status?: number },
  acceptHeader?: string,
): string | ApiErrorResponse {
  const apiError = toApiError(error);
  set.status = apiError.statusCode;

  // Return JSON if explicitly requested
  if (acceptHeader?.includes("application/json")) {
    return apiError.toResponse();
  }

  // Return HTML for web UI
  return result(`Error: ${apiError.message}`, "error");
}

/**
 * Handle command result errors consistently
 */
function handleCommandError(
  cmdResult: { success: boolean; error?: string; message?: string },
  set: { status?: number },
): string | null {
  if (!cmdResult.success) {
    const errorMessage =
      cmdResult.error || cmdResult.message || "Operation failed";
    set.status = 400;
    return result(errorMessage, "error");
  }
  return null;
}

/**
 * Generate HTML for job taskbar content
 */
function generateJobsHtml(jobs: Job[]): string {
  if (jobs.length === 0) {
    return `<script>document.getElementById('taskbar').classList.remove('has-jobs')</script>`;
  }

  const jobsHtml = jobs
    .map((job) =>
      jobItem({
        type: job.type,
        status: job.status,
        progress: job.progress,
        duration: formatDuration(job.startedAt, job.completedAt),
      }),
    )
    .join("");

  return `
    <script>document.getElementById('taskbar').classList.add('has-jobs')</script>
    <div class="taskbar-content">
      <span style="color: var(--text-muted)">Jobs:</span>
      ${jobsHtml}
    </div>
  `;
}

/**
 * Register all API routes
 */
export function registerApiRoutes(app: Elysia) {
  return app
    .post(
      "/api/scrape",
      async ({ body, set, headers }) => {
        try {
          const cmdResult = await scrapeCommand({
            username: body.username,
            includeReplies: !!body.includeReplies,
            includeRetweets: !!body.includeRetweets,
            maxTweets: Number(body.maxTweets) || 100,
          });

          const errorHtml = handleCommandError(cmdResult, set);
          if (errorHtml) return errorHtml;

          return result(
            `<strong>Success!</strong><br>
            Collected ${cmdResult.data?.tweetsCollected || 0} tweets<br>
            Session ID: ${cmdResult.data?.sessionId || "N/A"}`,
            "success",
          );
        } catch (e: unknown) {
          return handleApiError(e, set, headers?.accept);
        }
      },
      {
        body: t.Object({
          username: t.String(),
          includeReplies: t.Optional(t.Union([t.Boolean(), t.String()])),
          includeRetweets: t.Optional(t.Union([t.Boolean(), t.String()])),
          maxTweets: t.Optional(t.Union([t.Number(), t.String()])),
        }),
      },
    )

    .post(
      "/api/search",
      async ({ body, set, headers }) => {
        try {
          const cmdResult = await searchCommand({
            query: body.query,
            maxTweets: Number(body.maxTweets) || 100,
            days: body.days ? Number(body.days) : undefined,
            mode: body.mode as "latest" | "top",
            embed: !!body.embed,
          });

          const errorHtml = handleCommandError(cmdResult, set);
          if (errorHtml) return errorHtml;

          return result(
            `<strong>Success!</strong><br>
            Collected ${cmdResult.data?.tweetsCollected || 0} tweets<br>
            Users created: ${cmdResult.data?.usersCreated || 0}<br>
            Session ID: ${cmdResult.data?.sessionId || "N/A"}
            ${cmdResult.data?.embeddingsGenerated ? "<br>Embeddings generated!" : ""}`,
            "success",
          );
        } catch (e: unknown) {
          return handleApiError(e, set, headers?.accept);
        }
      },
      {
        body: t.Object({
          query: t.String(),
          maxTweets: t.Optional(t.Union([t.Number(), t.String()])),
          days: t.Optional(t.Union([t.Number(), t.String()])),
          mode: t.Optional(t.String()),
          embed: t.Optional(t.Union([t.Boolean(), t.String()])),
        }),
      },
    )

    .post(
      "/api/discover",
      async ({ body, set, headers }) => {
        const maxResults = Number(body.maxResults) || 20;
        const save = body.save === undefined ? true : !!body.save;
        const jobId = jobTracker.createJob("discover", { query: body.query });
        try {
          jobTracker.updateProgress(
            jobId,
            0,
            maxResults,
            `Searching for "${body.query}"...`,
          );

          const cmdResult = await discoverCommand({
            query: body.query,
            maxResults,
            save,
            json: true,
          });

          if (!cmdResult.success || !cmdResult.data) {
            jobTracker.completeJob(jobId, false);
            const errorHtml = handleCommandError(cmdResult, set);
            if (errorHtml) return errorHtml;
          }

          const profiles = cmdResult.data?.profiles || [];
          const savedCount = cmdResult.data?.savedCount || 0;

          jobTracker.updateProgress(
            jobId,
            profiles.length,
            profiles.length,
            `Found ${profiles.length} profiles`,
          );
          jobTracker.completeJob(jobId, true);

          const profilesHtml = profiles
            .map(
              (p: {
                username: string;
                name?: string;
                bio?: string;
                followers?: number;
                verified?: boolean;
                location?: string;
              }) =>
                profileItem({
                  username: p.username,
                  name: p.name,
                  bio: p.bio,
                  followers: p.followers,
                  verified: p.verified,
                  location: p.location,
                }),
            )
            .join("");

          return `
            ${result(
              `<strong>Found ${profiles.length} profiles</strong>${body.save ? ` | Saved ${savedCount} to database` : ""}`,
              "success",
            )}
            ${card("Discovered Profiles", profilesHtml || "<p>No profiles found</p>")}
          `;
        } catch (e: unknown) {
          jobTracker.completeJob(jobId, false);
          return handleApiError(e, set, headers?.accept);
        }
      },
      {
        body: t.Object({
          query: t.String(),
          maxResults: t.Optional(t.Union([t.Number(), t.String()])),
          save: t.Optional(t.Union([t.Boolean(), t.String()])),
        }),
      },
    )

    .post(
      "/api/ask",
      async ({ body, set, headers }) => {
        try {
          const cmdResult = await askCommand({
            question: body.question,
            topK: Number(body.topK) || 5,
            model: body.model || "gpt-4o-mini",
          });

          if (!cmdResult.success || !cmdResult.data) {
            const errorHtml = handleCommandError(cmdResult, set);
            if (errorHtml) return errorHtml;
          }

          const tweets = cmdResult.data?.relevantTweets || [];
          const tweetsHtml = tweets
            .map((t: { user?: string; text: string; similarity: number }) =>
              tweetItem(t.user || "unknown", t.text, t.similarity),
            )
            .join("");

          return `
            ${result(
              `<strong>Answer:</strong><br><br>${cmdResult.data?.answer}`,
              "success",
            )}
            ${card(`Relevant Tweets (${tweets.length})`, tweetsHtml)}
          `;
        } catch (e: unknown) {
          return handleApiError(e, set, headers?.accept);
        }
      },
      {
        body: t.Object({
          question: t.String(),
          topK: t.Optional(t.Union([t.Number(), t.String()])),
          model: t.Optional(t.String()),
        }),
      },
    )

    .post(
      "/api/embed",
      async ({ body, set, headers }) => {
        try {
          const cmdResult = await embedCommand({
            model: body.model || "text-embedding-3-small",
            batchSize: Number(body.batchSize) || 1000,
          });

          const errorHtml = handleCommandError(cmdResult, set);
          if (errorHtml) return errorHtml;

          return result(
            `<strong>Success!</strong><br>
            Embedded ${cmdResult.data?.tweetsEmbedded || 0} tweets<br>
            Model: ${cmdResult.data?.model || "N/A"}`,
            "success",
          );
        } catch (e: unknown) {
          return handleApiError(e, set, headers?.accept);
        }
      },
      {
        body: t.Object({
          model: t.Optional(t.String()),
          batchSize: t.Optional(t.Union([t.Number(), t.String()])),
        }),
      },
    )

    .get("/api/jobs", () => {
      return generateJobsHtml(jobTracker.getAllJobs());
    })

    .get("/api/jobs/stream", ({ set }) => {
      // Set SSE headers
      set.headers["content-type"] = "text/event-stream";
      set.headers["cache-control"] = "no-cache";
      set.headers["connection"] = "keep-alive";

      /**
       * Format HTML for SSE data field
       * SSE uses multiple `data:` lines for multi-line content
       */
      const formatSseData = (html: string): string => {
        const lines = html.split("\n").filter((line) => line.trim());
        return lines.map((line) => `data: ${line}`).join("\n");
      };

      // Create a readable stream for SSE
      let unsubscribe: (() => void) | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let isClosed = false;

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          // Send initial state immediately
          const initialJobs = jobTracker.getAllJobs();
          const initialHtml = generateJobsHtml(initialJobs);
          controller.enqueue(
            encoder.encode(`event: jobs\n${formatSseData(initialHtml)}\n\n`),
          );

          // Subscribe to job updates
          unsubscribe = jobTracker.subscribe((jobs) => {
            if (isClosed) return;
            try {
              const html = generateJobsHtml(jobs);
              controller.enqueue(
                encoder.encode(`event: jobs\n${formatSseData(html)}\n\n`),
              );
            } catch {
              // Controller closed, ignore
            }
          });

          // Send heartbeat every 30s to keep connection alive
          heartbeat = setInterval(() => {
            if (isClosed) return;
            try {
              controller.enqueue(encoder.encode(`: heartbeat\n\n`));
            } catch {
              // Controller closed, ignore
            }
          }, 30000);
        },
        cancel() {
          isClosed = true;
          if (unsubscribe) unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    })

    .post("/api/db/init", async ({ set, headers }) => {
      try {
        await initializeDatabase();
        return result("Database initialized successfully!", "success");
      } catch (e: unknown) {
        return handleApiError(e, set, headers?.accept);
      }
    })

    .post(
      "/api/config/set",
      async ({ body, set, headers }) => {
        try {
          const cmdResult = await setConfigCommand(body.key, body.value);
          if (cmdResult.success) {
            return `<div class="result success" style="padding: 0.5rem;">Saved!</div>`;
          }
          set.status = 400;
          return `<div class="result error" style="padding: 0.5rem;">${cmdResult.error}</div>`;
        } catch (e: unknown) {
          return handleApiError(e, set, headers?.accept);
        }
      },
      {
        body: t.Object({
          key: t.String(),
          value: t.String(),
        }),
      },
    );
}
