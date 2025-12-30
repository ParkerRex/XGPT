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
import { jobTracker } from "../../jobs/index.js";
import {
  result,
  card,
  tweetItem,
  profileItem,
  jobItem,
} from "../templates/index.js";
import { formatDuration } from "../../utils/format.js";

/**
 * Register all API routes
 */
export function registerApiRoutes(app: Elysia) {
  return app
    .post(
      "/api/scrape",
      async ({ body }) => {
        try {
          const cmdResult = await scrapeCommand({
            username: body.username,
            includeReplies: body.includeReplies || false,
            includeRetweets: body.includeRetweets || false,
            maxTweets: body.maxTweets || 100,
          });

          if (cmdResult.success) {
            return result(
              `<strong>Success!</strong><br>
              Collected ${cmdResult.data?.tweetsCollected || 0} tweets<br>
              Session ID: ${cmdResult.data?.sessionId || "N/A"}`,
              "success",
            );
          }
          return result(cmdResult.error || cmdResult.message, "error");
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Unknown error";
          return result(`Error: ${message}`, "error");
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
          const cmdResult = await searchCommand({
            query: body.query,
            maxTweets: body.maxTweets || 100,
            days: body.days,
            mode: body.mode as "latest" | "top",
            embed: body.embed || false,
          });

          if (cmdResult.success) {
            return result(
              `<strong>Success!</strong><br>
              Collected ${cmdResult.data?.tweetsCollected || 0} tweets<br>
              Users created: ${cmdResult.data?.usersCreated || 0}<br>
              Session ID: ${cmdResult.data?.sessionId || "N/A"}
              ${cmdResult.data?.embeddingsGenerated ? "<br>Embeddings generated!" : ""}`,
              "success",
            );
          }
          return result(cmdResult.error || cmdResult.message, "error");
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Unknown error";
          return result(`Error: ${message}`, "error");
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
      "/api/discover",
      async ({ body }) => {
        const jobId = jobTracker.createJob("discover", { query: body.query });
        try {
          jobTracker.updateProgress(
            jobId,
            0,
            body.maxResults || 20,
            `Searching for "${body.query}"...`,
          );

          const cmdResult = await discoverCommand({
            query: body.query,
            maxResults: body.maxResults || 20,
            save: body.save ?? true,
            json: true,
          });

          if (cmdResult.success && cmdResult.data) {
            const profiles = cmdResult.data.profiles || [];
            const savedCount = cmdResult.data.savedCount || 0;

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
          }
          jobTracker.completeJob(jobId, false);
          return result(cmdResult.error || cmdResult.message, "error");
        } catch (e: unknown) {
          jobTracker.completeJob(jobId, false);
          const message = e instanceof Error ? e.message : "Unknown error";
          return result(`Error: ${message}`, "error");
        }
      },
      {
        body: t.Object({
          query: t.String(),
          maxResults: t.Optional(t.Number()),
          save: t.Optional(t.Boolean()),
        }),
      },
    )

    .post(
      "/api/ask",
      async ({ body }) => {
        try {
          const cmdResult = await askCommand({
            question: body.question,
            topK: body.topK || 5,
            model: body.model || "gpt-4o-mini",
          });

          if (cmdResult.success && cmdResult.data) {
            const tweets = cmdResult.data.relevantTweets || [];
            const tweetsHtml = tweets
              .map((t: { user?: string; text: string; similarity: number }) =>
                tweetItem(t.user || "unknown", t.text, t.similarity),
              )
              .join("");

            return `
              ${result(
                `<strong>Answer:</strong><br><br>${cmdResult.data.answer}`,
                "success",
              )}
              ${card(`Relevant Tweets (${tweets.length})`, tweetsHtml)}
            `;
          }
          return result(cmdResult.error || cmdResult.message, "error");
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Unknown error";
          return result(`Error: ${message}`, "error");
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
          const cmdResult = await embedCommand({
            model: body.model || "text-embedding-3-small",
            batchSize: body.batchSize || 1000,
          });

          if (cmdResult.success) {
            return result(
              `<strong>Success!</strong><br>
              Embedded ${cmdResult.data?.tweetsEmbedded || 0} tweets<br>
              Model: ${cmdResult.data?.model || "N/A"}`,
              "success",
            );
          }
          return result(cmdResult.error || cmdResult.message, "error");
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Unknown error";
          return result(`Error: ${message}`, "error");
        }
      },
      {
        body: t.Object({
          model: t.Optional(t.String()),
          batchSize: t.Optional(t.Number()),
        }),
      },
    )

    .get("/api/jobs", () => {
      const jobs = jobTracker.getAllJobs();

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
    })

    .post("/api/db/init", async () => {
      try {
        await initializeDatabase();
        return result("Database initialized successfully!", "success");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return result(`Error: ${message}`, "error");
      }
    })

    .post(
      "/api/config/set",
      async ({ body }) => {
        try {
          const cmdResult = await setConfigCommand(body.key, body.value);
          if (cmdResult.success) {
            return `<div class="result success" style="padding: 0.5rem;">Saved!</div>`;
          }
          return `<div class="result error" style="padding: 0.5rem;">${cmdResult.error}</div>`;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Unknown error";
          return `<div class="result error" style="padding: 0.5rem;">Error: ${message}</div>`;
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
