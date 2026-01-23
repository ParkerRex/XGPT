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
import { createQueryIdCacheTransform } from "../twitter/queryIdCache.js";
import { shouldShowProgress } from "../utils/scriptMode.js";
import {
  compareTweetIds,
  parseCursorState,
  redactCursor,
  serializeCursorState,
  waitForPageDelay,
} from "../utils/pagination.js";
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
    return resumeSearch(options.resume, options);
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

    // 7. Handle embedding (session-only scope)
    if (options.embed && stats.tweetsCollected > 0) {
      console.log(`\n[embed] Generating embeddings for session tweets...`);
      await embedCommand({ searchSessionId: session.id });
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
      pageCount: stats.pageCount ?? 0,
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
  resumeState?: { skipBeforeId?: string | null },
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
    transform: createQueryIdCacheTransform(),
    experimental: {
      xClientTransactionId: true,
      xpff: true,
    },
  });
  await scraper.setCookies(cookies);

  const searchMode =
    options.mode === "top" ? SearchMode.Top : SearchMode.Latest;
  const effectiveMaxTweets = options.all
    ? Number.MAX_SAFE_INTEGER
    : options.maxTweets;
  const pageSize = 50;
  const cursorState = parseCursorState(options.cursor);
  const startQueryIndex = cursorState?.queryIndex ?? 0;
  let nextCursor: string | null = null;
  let lastTweetId: string | null = resumeState?.skipBeforeId ?? null;
  let pageCount = 0;

  for (let queryIndex = startQueryIndex; queryIndex < queries.length; queryIndex++) {
    const query = queries[queryIndex]!;
    let cursor =
      queryIndex === startQueryIndex
        ? cursorState?.cursor ?? undefined
        : undefined;

    if (queries.length > 1) {
      console.log(
        `\n[search] Query ${queryIndex + 1}/${queries.length}: ${query.substring(0, 80)}...`,
      );
    }

    try {
      while (stats.tweetsCollected < effectiveMaxTweets) {
        if (options.maxPages && pageCount >= options.maxPages) break;

        const remaining = effectiveMaxTweets - stats.tweetsCollected;
        const maxPerPage = Math.min(pageSize, remaining);
        const response = await scraper.fetchSearchTweets(
          query,
          maxPerPage,
          searchMode,
          cursor,
        );

        pageCount++;
        const tweets = response.tweets ?? [];

        for (const tweet of tweets) {
          stats.totalProcessed++;

          // Update live counter (every tweet)
          updateProgress(stats, effectiveMaxTweets);

          // Skip unavailable tweets silently
          if (!tweet.id || !tweet.text) continue;

          if (
            resumeState?.skipBeforeId &&
            compareTweetIds(tweet.id, resumeState.skipBeforeId) <= 0
          ) {
            continue;
          }

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
          lastTweetId = tweet.id;

          // Check if we've hit max
          if (stats.tweetsCollected >= effectiveMaxTweets) break;
        }

        cursor = response.next;
        nextCursor = cursor ?? null;

        await searchSessionQueries.saveCursor(
          session.id,
          serializeCursorState({ queryIndex, cursor: cursor ?? null }),
          lastTweetId,
          pageCount,
        );

        if (!cursor) break;
        if (options.maxPages && pageCount >= options.maxPages) break;
        if (stats.tweetsCollected >= effectiveMaxTweets) break;

        await waitForPageDelay(options.delayMs);
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
    if (stats.tweetsCollected >= effectiveMaxTweets) break;
    if (options.maxPages && pageCount >= options.maxPages) break;

    if (queryIndex < queries.length - 1) {
      await searchSessionQueries.saveCursor(
        session.id,
        serializeCursorState({ queryIndex: queryIndex + 1, cursor: null }),
        lastTweetId,
        pageCount,
      );
    }
  }

  clearProgressLine();

  stats.pageCount = pageCount;
  stats.nextCursor = nextCursor;
  stats.lastTweetId = lastTweetId;
  return stats;
}

function updateProgress(stats: SearchStats, max: number): void {
  if (!shouldShowProgress()) return;
  const line = `[search] ${stats.totalProcessed}/${max} tweets (${stats.tweetsCollected} new, ${stats.duplicatesSkipped} duplicates)`;
  process.stdout.write(`\r${line}`);
}

function clearProgressLine(): void {
  if (!shouldShowProgress()) return;
  process.stdout.write("\r" + " ".repeat(80) + "\r");
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
  if (stats.sessionId) {
    console.log(`[stats] Session: ${stats.sessionId}`);
  }
  if (stats.pageCount !== undefined) {
    console.log(`[stats] Pages: ${stats.pageCount}`);
  }
  if (stats.nextCursor !== undefined) {
    console.log(`[stats] Next cursor: ${redactCursor(stats.nextCursor)}`);
  }

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

async function resumeSearch(
  sessionId: number,
  options: SearchOptions,
): Promise<CommandResult> {
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
  if (!cursorData && !options.fresh && !options.cursor) {
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
  const parsedCursor = parseCursorState(cursorData?.cursor ?? null);
  if (parsedCursor?.cursor) {
    console.log(`[info] Saved cursor: ${redactCursor(parsedCursor.cursor)}`);
  }

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
    transform: createQueryIdCacheTransform(),
    experimental: {
      xClientTransactionId: true,
      xpff: true,
    },
  });
  await scraper.setCookies(cookies);

  const searchMode =
    session.searchMode === "Top" ? SearchMode.Top : SearchMode.Latest;
  const resumeOptions: SearchOptions = {
    ...options,
    query: session.query,
    maxTweets: session.maxTweets,
    mode: session.searchMode === "Top" ? "top" : "latest",
    dryRun: false,
    json: options.json,
    cursor:
      options.cursor ?? (options.fresh ? undefined : cursorData?.cursor),
  };

  if (options.fresh) {
    stats.tweetsCollected = 0;
    stats.totalProcessed = 0;
    stats.duplicatesSkipped = 0;
    stats.usersCreated = 0;
    await searchSessionQueries.updateSession(sessionId, {
      tweetsCollected: 0,
      totalProcessed: 0,
      duplicatesSkipped: 0,
      usersCreated: 0,
    });
  }

  const resumeStats = await executeSearch(
    session,
    twitterQueries,
    variants,
    resumeOptions,
    options.fresh || options.cursor
      ? undefined
      : { skipBeforeId: cursorData?.lastTweetId ?? null },
  );

  clearProgressLine();

  // Update session with final results
  await searchSessionQueries.updateSession(sessionId, {
    tweetsCollected: resumeStats.tweetsCollected,
    totalProcessed: resumeStats.totalProcessed,
    duplicatesSkipped: resumeStats.duplicatesSkipped,
    usersCreated: resumeStats.usersCreated,
    status: "completed",
    completedAt: new Date(),
    pageCount: resumeStats.pageCount ?? session.pageCount ?? 0,
  });

  return {
    success: true,
    message: `[ok] Resume complete: ${resumeStats.tweetsCollected} total tweets, ${resumeStats.usersCreated} users created`,
  };
}
