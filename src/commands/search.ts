import {
  Scraper,
  SearchMode,
  WaitingRateLimitStrategy,
  type RateLimitStrategy,
  type RateLimitEvent,
} from "@the-convocation/twitter-scraper";
import "dotenv/config";
import type {
  SearchOptions,
  SearchStats,
  CommandResult,
} from "../types/common.js";
import {
  parseSearchVariants,
  buildTwitterQuery,
  calculateSearchDateRange,
  matchVariant,
  splitQuery,
  parseDuration,
  formatDateRangeDisplay,
  isRateLimitError,
  waitForRateLimitReset,
  type DateRange,
} from "../utils/searchUtils.js";
import {
  userQueries,
  tweetQueries,
  searchTopicQueries,
  searchSessionQueries,
  tweetOriginQueries,
} from "../database/queries.js";
import type {
  NewTweet,
  SearchSession,
  SearchTopic,
} from "../database/schema.js";
import { handleCommandError, AuthenticationError } from "../errors/index.js";
import { embedCommand } from "./embed.js";

export async function searchCommand(
  options: SearchOptions,
): Promise<CommandResult> {
  // Handle cleanup mode
  if (options.cleanup) {
    return handleCleanup(options.olderThan);
  }

  // Handle resume mode
  if (options.resume) {
    return resumeSearch(options.resume);
  }

  // Validate input
  if (!options.query) {
    return { success: false, message: "Search query required" };
  }

  try {
    // 1. Parse input
    const variants = parseSearchVariants(options.query);
    if (variants.length === 0) {
      return {
        success: false,
        message: "At least one search variant required",
      };
    }
    if (options.maxTweets <= 0) {
      return { success: false, message: "Max tweets must be greater than 0" };
    }

    const dateRange = calculateSearchDateRange(
      options.days,
      options.since,
      options.until,
    );

    // 2. Handle query splitting if needed
    const queryGroups = splitQuery(variants);
    const twitterQueries = queryGroups.map((group) =>
      buildTwitterQuery(group, dateRange ?? undefined),
    );

    // 3. Dry run mode
    if (options.dryRun) {
      return handleDryRun(variants, twitterQueries, dateRange, options);
    }

    // 4. Handle named topic
    let topic: SearchTopic | null = null;
    if (options.name) {
      topic = await searchTopicQueries.getTopicByName(options.name);
      if (!topic) {
        topic = await searchTopicQueries.createTopic(options.name, variants);
        console.log(`[topic] Created new topic: "${options.name}"`);
      } else {
        console.log(`[topic] Using existing topic: "${options.name}"`);
      }
    }

    // 5. Create search session
    const session = await searchSessionQueries.createSession({
      topicId: topic?.id ?? null,
      query: twitterQueries.join(" | "),
      variants,
      searchMode: options.mode === "top" ? "Top" : "Latest",
      maxTweets: options.maxTweets,
      dateStart: dateRange?.start ?? null,
      dateEnd: dateRange?.end ?? null,
      status: "running",
    });

    console.log(`[search] Starting search (session ${session.id})...`);
    console.log(`[info] Variants: ${variants.map((v) => `"${v}"`).join(", ")}`);
    if (dateRange) {
      console.log(`[info] Date range: ${formatDateRangeDisplay(dateRange)}`);
    }
    console.log(`[info] Mode: ${options.mode}, Max: ${options.maxTweets}`);

    // 6. Execute search
    const stats = await executeSearch(
      session,
      twitterQueries,
      variants,
      options,
    );

    // 7. Handle embedding
    if (options.embed && stats.tweetsCollected > 0) {
      console.log(`\n[embed] Generating embeddings for session tweets...`);
      await embedCommand({});
      stats.embeddingsGenerated = true;
      await searchSessionQueries.updateSession(session.id, {
        embeddingsGenerated: true,
      });
    }

    // 8. Update session
    await searchSessionQueries.updateSession(session.id, {
      tweetsCollected: stats.tweetsCollected,
      totalProcessed: stats.totalProcessed,
      duplicatesSkipped: stats.duplicatesSkipped,
      usersCreated: stats.usersCreated,
      status: "completed",
      completedAt: new Date(),
    });

    // 9. Update topic stats
    if (topic) {
      await searchTopicQueries.updateTopicStats(
        topic.id,
        stats.tweetsCollected,
      );
    }

    stats.sessionId = session.id;

    // 10. Return results
    return formatResults(stats, options.json);
  } catch (error) {
    return handleCommandError(error, {
      command: "search",
      operation: "topic_search",
    });
  }
}

async function executeSearch(
  session: SearchSession,
  queries: string[],
  variants: string[],
  options: SearchOptions,
): Promise<SearchStats> {
  const stats: SearchStats = {
    tweetsCollected: 0,
    totalProcessed: 0,
    duplicatesSkipped: 0,
    usersCreated: 0,
  };

  // Set up cookies for authentication
  const cookies = [
    `auth_token=${process.env.AUTH_TOKEN}; Path=/; Domain=.x.com; Secure; HttpOnly`,
    `ct0=${process.env.CT0}; Path=/; Domain=.x.com; Secure`,
  ];

  if (!process.env.AUTH_TOKEN || !process.env.CT0) {
    throw new AuthenticationError(
      "Twitter authentication tokens are missing or invalid",
      {
        command: "search",
        operation: "authentication_check",
      },
    );
  }

  // Create a custom rate limit strategy
  const customRateLimitStrategy: RateLimitStrategy = {
    async onRateLimit(event: RateLimitEvent): Promise<void> {
      console.log(
        `\n[warn] Twitter API rate limit hit. Using library's built-in wait strategy...`,
      );
      const waitingStrategy = new WaitingRateLimitStrategy();
      await waitingStrategy.onRateLimit(event);
    },
  };

  // Initialize scraper
  const scraper = new Scraper({
    rateLimitStrategy: customRateLimitStrategy,
    experimental: {
      xClientTransactionId: true,
      xpff: true,
    },
  });
  await scraper.setCookies(cookies);

  const searchMode =
    options.mode === "top" ? SearchMode.Top : SearchMode.Latest;
  const maxPerQuery = Math.ceil(options.maxTweets / queries.length);

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
    const query = queries[queryIndex]!;

    if (queries.length > 1) {
      console.log(
        `\n[search] Query ${queryIndex + 1}/${queries.length}: ${query.substring(0, 80)}...`,
      );
    }

    try {
      for await (const tweet of scraper.searchTweets(
        query,
        maxPerQuery,
        searchMode,
      )) {
        stats.totalProcessed++;

        // Update live counter (every tweet)
        updateProgress(stats, options.maxTweets);

        // Skip unavailable tweets silently
        if (!tweet.id || !tweet.text) continue;

        // Check for duplicate (pre-existing only)
        const exists = await tweetQueries.tweetExists(tweet.id);
        if (exists) {
          stats.duplicatesSkipped++;
          // Still record origin if this is a new search that found an existing tweet
          continue;
        }

        // Create user if needed (basic profile from tweet metadata)
        const username = tweet.username ?? "unknown";
        const user = await userQueries.upsertUser(
          username,
          tweet.name ?? undefined,
        );
        if (user.createdAt && user.createdAt.getTime() > Date.now() - 1000) {
          stats.usersCreated++;
        }

        // Save tweet
        const dbTweet: NewTweet = {
          id: tweet.id,
          text: (tweet.text ?? "").replace(/\s+/g, " ").trim(),
          userId: user.id,
          username: username,
          createdAt: tweet.timeParsed ?? new Date(),
          isRetweet: tweet.isRetweet ?? false,
          isReply: tweet.isReply ?? false,
          likes: tweet.likes ?? 0,
          retweets: tweet.retweets ?? 0,
          replies: tweet.replies ?? 0,
          metadata: JSON.stringify({
            isQuoted: tweet.isQuoted,
            quotedStatus: tweet.quotedStatus?.id,
            conversationId: tweet.conversationId,
          }),
        };

        try {
          await tweetQueries.insertTweets([dbTweet]);
        } catch (insertError) {
          // Handle duplicate constraint errors silently
          if (
            insertError instanceof Error &&
            insertError.message.includes("UNIQUE constraint")
          ) {
            stats.duplicatesSkipped++;
            continue;
          }
          throw insertError;
        }

        // Record origin (first-origin-only via UNIQUE constraint)
        const matchedVariant =
          matchVariant(tweet.text, variants) ?? variants[0]!;
        await tweetOriginQueries.recordTweetOrigin({
          tweetId: tweet.id,
          searchSessionId: session.id,
          matchedVariant,
        });

        stats.tweetsCollected++;

        // Save cursor periodically for resume support (every 50 tweets)
        if (stats.totalProcessed % 50 === 0) {
          await searchSessionQueries.saveCursor(
            session.id,
            "", // Twitter's searchTweets doesn't expose cursor directly
            tweet.id,
          );
        }

        // Check if we've hit max
        if (stats.tweetsCollected >= options.maxTweets) break;
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        // Auto-wait for rate limit reset
        console.log("\n[warn] Rate limited. Waiting for reset...");
        await waitForRateLimitReset(error);
        // Retry by continuing with same query
        queryIndex--;
        continue;
      }
      // Skip and continue on other errors
      console.error(`\n[error] Error processing search: ${error}`);
      continue;
    }

    // Check if we've hit max after this query
    if (stats.tweetsCollected >= options.maxTweets) break;
  }

  // Clear progress line
  process.stdout.write("\r" + " ".repeat(80) + "\r");

  return stats;
}

function updateProgress(stats: SearchStats, max: number): void {
  const line = `[search] ${stats.totalProcessed}/${max} tweets (${stats.tweetsCollected} new, ${stats.duplicatesSkipped} duplicates)`;
  process.stdout.write(`\r${line}`);
}

function formatResults(stats: SearchStats, asJson: boolean): CommandResult {
  if (asJson) {
    return {
      success: true,
      message: "Search completed",
      data: stats,
    };
  }

  if (stats.tweetsCollected === 0 && stats.totalProcessed === 0) {
    return {
      success: true,
      message: `No tweets found. Try broader variants or different date range.

Suggestions:
- Add more variant spellings
- Extend the date range with --days
- Try --mode top for popular tweets`,
    };
  }

  const message = `[ok] Search complete: ${stats.tweetsCollected} new tweets, ${stats.duplicatesSkipped} duplicates, ${stats.usersCreated} users created`;
  console.log(message);

  return {
    success: true,
    message,
    data: stats,
  };
}

function handleDryRun(
  variants: string[],
  queries: string[],
  dateRange: DateRange | null,
  options: SearchOptions,
): CommandResult {
  const totalQueryLength = queries.reduce((sum, q) => sum + q.length, 0);

  let output = `Dry Run - Query Preview\n\n`;
  output += `Variants (${variants.length}): ${variants.map((v) => `"${v}"`).join(", ")}\n`;

  if (dateRange) {
    output += `Date range: ${formatDateRangeDisplay(dateRange)} (local time)\n`;
  }

  output += `Search mode: ${options.mode === "top" ? "Top" : "Latest"}\n`;
  output += `Max tweets: ${options.maxTweets}\n\n`;

  if (queries.length > 1) {
    output += `Twitter queries (${queries.length} splits due to length):\n`;
    queries.forEach((q, i) => {
      output += `  ${i + 1}. ${q}\n`;
    });
  } else {
    output += `Twitter query:\n${queries[0]}\n`;
  }

  output += `\nTotal query length: ${totalQueryLength}/500 characters`;

  console.log(output);
  return { success: true, message: output };
}

async function handleCleanup(olderThan?: string): Promise<CommandResult> {
  if (!olderThan) {
    return {
      success: false,
      message: "Please specify --older-than (e.g., --older-than 30d)",
    };
  }

  try {
    const days = parseDuration(olderThan);
    const deleted = await searchSessionQueries.cleanupOldSessions(days);
    return {
      success: true,
      message: `Deleted ${deleted} search sessions older than ${days} days`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Invalid duration",
    };
  }
}

async function resumeSearch(sessionId: number): Promise<CommandResult> {
  const session = await searchSessionQueries.getSessionById(sessionId);
  if (!session) {
    return { success: false, message: `Search session ${sessionId} not found` };
  }

  if (session.status === "completed") {
    return {
      success: false,
      message: `Search session ${sessionId} is already completed`,
    };
  }

  const cursorData = await searchSessionQueries.getCursor(sessionId);
  if (!cursorData) {
    return {
      success: false,
      message: `No cursor saved for session ${sessionId}. Cannot resume.`,
    };
  }

  // Mark session as running again
  await searchSessionQueries.updateSession(sessionId, { status: "running" });

  // Reconstruct options from session
  const variants = session.variants;
  const dateRange =
    session.dateStart && session.dateEnd
      ? { start: session.dateStart, end: session.dateEnd }
      : null;

  // Rebuild query groups (same logic as initial search)
  const queryGroups = splitQuery(variants);
  const twitterQueries = queryGroups.map((group) =>
    buildTwitterQuery(group, dateRange ?? undefined),
  );

  // Initialize stats from existing session data
  const stats: SearchStats = {
    tweetsCollected: session.tweetsCollected ?? 0,
    totalProcessed: session.totalProcessed ?? 0,
    duplicatesSkipped: session.duplicatesSkipped ?? 0,
    usersCreated: session.usersCreated ?? 0,
  };

  console.log(`[resume] Resuming search session ${sessionId}...`);
  console.log(
    `[info] Progress: ${stats.tweetsCollected}/${session.maxTweets} tweets collected`,
  );

  // Set up cookies for authentication
  const cookies = [
    `auth_token=${process.env.AUTH_TOKEN}; Path=/; Domain=.x.com; Secure; HttpOnly`,
    `ct0=${process.env.CT0}; Path=/; Domain=.x.com; Secure`,
  ];

  if (!process.env.AUTH_TOKEN || !process.env.CT0) {
    throw new AuthenticationError(
      "Twitter authentication tokens are missing or invalid",
      {
        command: "search",
        operation: "authentication_check",
      },
    );
  }

  // Create a custom rate limit strategy
  const customRateLimitStrategy: RateLimitStrategy = {
    async onRateLimit(event: RateLimitEvent): Promise<void> {
      console.log(
        `\n[warn] Twitter API rate limit hit. Using library's built-in wait strategy...`,
      );
      const waitingStrategy = new WaitingRateLimitStrategy();
      await waitingStrategy.onRateLimit(event);
    },
  };

  // Initialize scraper
  const scraper = new Scraper({
    rateLimitStrategy: customRateLimitStrategy,
    experimental: {
      xClientTransactionId: true,
      xpff: true,
    },
  });
  await scraper.setCookies(cookies);

  const searchMode =
    session.searchMode === "Top" ? SearchMode.Top : SearchMode.Latest;
  const remainingTweets = session.maxTweets - stats.tweetsCollected;

  // Resume from cursor position
  for (const query of twitterQueries) {
    try {
      for await (const tweet of scraper.searchTweets(
        query,
        remainingTweets,
        searchMode,
      )) {
        // Skip tweets we've already processed (before cursor)
        if (tweet.id && tweet.id <= cursorData.lastTweetId) {
          continue;
        }

        stats.totalProcessed++;
        updateProgress(stats, session.maxTweets);

        // Skip unavailable tweets silently
        if (!tweet.id || !tweet.text) continue;

        // Check for duplicate (pre-existing only)
        const exists = await tweetQueries.tweetExists(tweet.id);
        if (exists) {
          stats.duplicatesSkipped++;
          continue;
        }

        // Create user if needed
        const username = tweet.username ?? "unknown";
        const user = await userQueries.upsertUser(
          username,
          tweet.name ?? undefined,
        );
        if (user.createdAt && user.createdAt.getTime() > Date.now() - 1000) {
          stats.usersCreated++;
        }

        // Save tweet
        const dbTweet: NewTweet = {
          id: tweet.id,
          text: (tweet.text ?? "").replace(/\s+/g, " ").trim(),
          userId: user.id,
          username: username,
          createdAt: tweet.timeParsed ?? new Date(),
          isRetweet: tweet.isRetweet ?? false,
          isReply: tweet.isReply ?? false,
          likes: tweet.likes ?? 0,
          retweets: tweet.retweets ?? 0,
          replies: tweet.replies ?? 0,
        };

        try {
          await tweetQueries.insertTweets([dbTweet]);
        } catch (insertError) {
          if (
            insertError instanceof Error &&
            insertError.message.includes("UNIQUE constraint")
          ) {
            stats.duplicatesSkipped++;
            continue;
          }
          throw insertError;
        }

        // Record origin
        const matchedVariant =
          matchVariant(tweet.text, variants) ?? variants[0]!;
        await tweetOriginQueries.recordTweetOrigin({
          tweetId: tweet.id,
          searchSessionId: sessionId,
          matchedVariant,
        });

        stats.tweetsCollected++;

        // Save cursor periodically
        if (stats.totalProcessed % 50 === 0) {
          await searchSessionQueries.saveCursor(sessionId, "", tweet.id);
        }

        if (stats.tweetsCollected >= session.maxTweets) break;
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        console.log("\n[warn] Rate limited. Waiting for reset...");
        await waitForRateLimitReset(error);
        continue;
      }
      console.error(`\n[error] Error processing tweet: ${error}`);
      continue;
    }
  }

  // Clear progress line
  process.stdout.write("\r" + " ".repeat(80) + "\r");

  // Update session with final results
  await searchSessionQueries.updateSession(sessionId, {
    tweetsCollected: stats.tweetsCollected,
    totalProcessed: stats.totalProcessed,
    duplicatesSkipped: stats.duplicatesSkipped,
    usersCreated: stats.usersCreated,
    status: "completed",
    completedAt: new Date(),
  });

  return {
    success: true,
    message: `[ok] Resume complete: ${stats.tweetsCollected} total tweets, ${stats.usersCreated} users created`,
  };
}
