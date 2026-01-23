import {
  Scraper,
  WaitingRateLimitStrategy,
  type RateLimitStrategy,
  type RateLimitEvent,
} from "@the-convocation/twitter-scraper";
import "dotenv/config";
import type { ScrapingOptions, Tweet, CommandResult } from "../types/common.js";
import { matchesKeywords } from "../prompts/searchScope.js";
import { isWithinDateRange } from "../utils/dateUtils.js";
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
  sessionQueries,
} from "../database/queries.js";
import type {
  NewTweet,
  NewScrapeSession,
  ScrapeSession,
  User,
} from "../database/schema.js";
import { RateLimitManager } from "../rateLimit/manager.js";
import { getRateLimitProfile, isRateLimitError } from "../rateLimit/config.js";
import { TweetEstimator } from "../rateLimit/estimator.js";
import {
  handleCommandError,
  AuthenticationError,
  RateLimitError,
} from "../errors/index.js";
import { createProgressBar, ProgressPresets, StatusLine } from "../ui/index.js";
import { createQueryIdCacheTransform } from "../twitter/queryIdCache.js";

export async function scrapeCommand(
  options: ScrapingOptions,
): Promise<CommandResult> {
  const {
    username,
    includeReplies = false,
    includeRetweets = false,
    maxTweets = 10000,
    keywords,
    dateRange,
    rateLimitProfile = "conservative",
    resume,
  } = options;

  try {
    if (resume) {
      return resumeScrape(resume, options);
    }

    console.log(`[scrape] Starting to scrape tweets from @${username}...`);

    // Create or update user in database
    console.log(`[user] Setting up user @${username} in database...`);
    const user = await userQueries.upsertUser(username, username);
    console.log(`[ok] User @${username} ready (ID: ${user.id})`);

    // Create scrape session record
    const sessionData: NewScrapeSession = {
      userId: user.id,
      username: username,
      contentType:
        includeReplies && includeRetweets
          ? "both"
          : includeReplies
            ? "replies"
            : "tweets",
      searchScope: keywords && keywords.length > 0 ? "keywords" : "all",
      keywords: keywords ? JSON.stringify(keywords) : null,
      timeRange: dateRange ? "custom" : "lifetime",
      customDateRange: dateRange ? JSON.stringify(dateRange) : null,
      maxTweets: maxTweets,
      includeReplies,
      includeRetweets,
      rateLimitProfile,
      status: "running",
    };

    const session = await sessionQueries.createSession(sessionData);
    console.log(`[stats] Created scrape session (ID: ${session.id})`);

    return executeScrape(session, user, options);
  } catch (error) {
    // Update session status if session was created
    try {
      const sessions = await sessionQueries.getSessionsByUser(username);
      const runningSession = sessions.find((s) => s.status === "running");
      if (runningSession) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        await sessionQueries.updateSessionStatus(runningSession.id, "failed", {
          errorMessage: errorMessage,
        });
      }
    } catch (sessionError) {
      console.error("[error] Failed to update session status:", sessionError);
    }

    // Use comprehensive error handling
    return handleCommandError(error, {
      command: "scrape",
      username,
      operation: "tweet_scraping",
    });
  }
}


async function executeScrape(
  session: ScrapeSession,
  user: User,
  options: ScrapingOptions,
): Promise<CommandResult> {
  const {
    username,
    includeReplies = false,
    includeRetweets = false,
    maxTweets = 10000,
    keywords,
    dateRange,
    rateLimitProfile = "conservative",
  } = options;

  try {
      // Set up cookies for authentication
      const cookies = [
        `auth_token=${process.env.AUTH_TOKEN}; Path=/; Domain=.x.com; Secure; HttpOnly`,
        `ct0=${process.env.CT0}; Path=/; Domain=.x.com; Secure`,
      ];

      if (!process.env.AUTH_TOKEN || !process.env.CT0) {
        await sessionQueries.updateSessionStatus(session.id, "failed", {
            errorMessage: "Missing authentication tokens",
        });

        const authError = new AuthenticationError(
            "Twitter authentication tokens are missing or invalid",
            {
              command: "scrape",
              username,
              operation: "authentication_check",
            },
        );
        return handleCommandError(authError);
      }

      // Set up rate limiting for account protection
      const profile = getRateLimitProfile(rateLimitProfile);
      const rateLimiter = new RateLimitManager({ profile });

      console.log(
        `[rate] Rate limiting active: ${profile.name} profile (${profile.description})`,
      );
      console.log(
        `[info] Rate: ${profile.requestsPerMinute} requests/min, ${profile.requestsPerHour} requests/hour`,
      );

      // Show collection time estimate
      const estimate = TweetEstimator.estimateCollectionTime(maxTweets, profile);
      console.log(TweetEstimator.formatEstimate(estimate));

      if (estimate.warningMessage) {
        console.log(`\n${estimate.warningMessage}`);
      }
      console.log();

      // Create a custom rate limit strategy that integrates with our rate limiter
      const customRateLimitStrategy: RateLimitStrategy = {
        async onRateLimit(event: RateLimitEvent): Promise<void> {
            rateLimiter.recordRequest(
              false,
              event.response.status,
              new Error("Rate limit from Twitter API"),
            );
            console.log(
              `\n[warn] Twitter API rate limit hit. Using library's built-in wait strategy...`,
            );
            // Delegate to the library's waiting strategy
            const waitingStrategy = new WaitingRateLimitStrategy();
            await waitingStrategy.onRateLimit(event);
        },
      };

      // Initialize scraper with library's rate limit handling and experimental features
      const scraper = new Scraper({
        rateLimitStrategy: customRateLimitStrategy,
        transform: createQueryIdCacheTransform(),
        experimental: {
            xClientTransactionId: true, // May help avoid detection
            xpff: true, // May help avoid detection
        },
      });
      await scraper.setCookies(cookies);

      // Show active filters
      console.log(`[stats] Active filters:`);
      console.log(`   • Replies: ${includeReplies ? "included" : "excluded"}`);
      console.log(`   • Retweets: ${includeRetweets ? "included" : "excluded"}`);
      if (keywords && keywords.length > 0) {
        console.log(`   • Keywords: ${keywords.join(", ")}`);
      }
      if (dateRange) {
        console.log(
            `   • Date range: ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`,
        );
      }
      console.log();

      // Initialize progress tracking
      const effectiveMaxTweets = options.all
        ? Number.MAX_SAFE_INTEGER
        : maxTweets;
      const pageSize = 100;
      const startingTotals = {
        tweetsCollected: session.tweetsCollected ?? 0,
        totalProcessed: session.totalProcessed ?? 0,
        contentFiltered: session.contentFiltered ?? 0,
        keywordFiltered: session.keywordFiltered ?? 0,
        dateFiltered: session.dateFiltered ?? 0,
      };
      let pageCount = session.pageCount ?? 0;
      let scrapedCount = startingTotals.totalProcessed;
      let filteredCount = 0;
      let keywordFilteredCount = 0;
      let dateFilteredCount = 0;
      let rateLimitDelays = 0;
      const tweets: Tweet[] = [];
      const tweetBatch: NewTweet[] = [];
      const resumeState = parseCursorState(options.cursor);
      const skipBeforeId = resumeState?.cursor ?? null;
      let lastTweetId: string | null = null;

      // Create progress bar with rate limit awareness
      const progressBar = createProgressBar(ProgressPresets.scraping(username));
      progressBar.start(effectiveMaxTweets);

      try {
        // Use library's getTweetsAndReplies() when replies are requested
        // This is more efficient than filtering manually
        const tweetIterator = includeReplies
            ? scraper.getTweetsAndReplies(username, effectiveMaxTweets)
            : scraper.getTweets(username, effectiveMaxTweets);

        for await (const tweet of tweetIterator) {
            // Apply rate limiting before processing each tweet
            try {
              await rateLimiter.waitForPermission();
              rateLimiter.recordRequest(true); // Record successful request
            } catch (error) {
              rateLimitDelays++;
              rateLimiter.recordRequest(false, undefined, error);

              // Update progress bar to show delay
          progressBar.update(startingTotals.tweetsCollected + tweets.length, {
            processed: scrapedCount,
            delays: rateLimitDelays,
          });

              // Check if we should pause scraping
              if (rateLimiter.shouldPauseScraping()) {
                  console.log(
                    "\n[warn] Too many rate limit errors. Pausing scraping for account safety.",
                  );
                  break;
              }

              // Continue with next iteration after rate limit handling
              continue;
            }

            scrapedCount++;

            // Apply content type filters - retweets still need filtering
            if (!includeRetweets && tweet.isRetweet) {
              filteredCount++;
              continue;
            }

            // Note: Reply filtering is now handled by the library method choice above
            // We only need to filter replies if getTweets() somehow returns them
            if (!includeReplies && tweet.isReply) {
              filteredCount++;
              continue;
            }

            // Apply date range filter
            if (dateRange && tweet.timeParsed) {
              if (
                  !isWithinDateRange(tweet.timeParsed, dateRange.start, dateRange.end)
              ) {
                  dateFilteredCount++;
                  continue;
              }
            }

            // Apply keyword filter
            if (keywords && keywords.length > 0) {
              if (!matchesKeywords(tweet.text ?? "", keywords)) {
                  keywordFilteredCount++;
                  continue;
              }
            }

            if (
              skipBeforeId &&
              tweet.id &&
              compareTweetIds(tweet.id, skipBeforeId) <= 0
            ) {
              continue;
            }

            // Process and store tweet
            const processedTweet: Tweet = {
              id: tweet.id!,
              text: (tweet.text ?? "").replace(/\s+/g, " ").trim(),
              user: username,
              created_at: tweet.timeParsed?.toISOString(),
              metadata: {
                  isRetweet: tweet.isRetweet,
                  isReply: tweet.isReply,
                  likes: tweet.likes,
                  retweets: tweet.retweets,
                  replies: tweet.replies,
              },
            };

            // Prepare tweet for database insertion
            const dbTweet: NewTweet = {
              id: tweet.id!,
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
                  isRetweet: tweet.isRetweet,
                  isReply: tweet.isReply,
                  likes: tweet.likes,
                  retweets: tweet.retweets,
                  replies: tweet.replies,
              }),
            };

        tweets.push(processedTweet);
        tweetBatch.push(dbTweet);
        lastTweetId = tweet.id ?? lastTweetId;

            // Update progress bar
        progressBar.update(startingTotals.tweetsCollected + tweets.length, {
          processed: scrapedCount,
          delays: rateLimitDelays,
          errors: 0,
          skipped: filteredCount + keywordFilteredCount + dateFilteredCount,
        });

        if (startingTotals.tweetsCollected + tweets.length >= effectiveMaxTweets) {
          progressBar.update(effectiveMaxTweets, {
            processed: scrapedCount,
            delays: rateLimitDelays,
            errors: 0,
            skipped: filteredCount + keywordFilteredCount + dateFilteredCount,
          });
          break;
        }

        const totalCollected = startingTotals.tweetsCollected + tweets.length;
        if (totalCollected % pageSize === 0) {
          pageCount = Math.floor(totalCollected / pageSize);
          const lastTweetId = tweet.id ?? null;
          await sessionQueries.saveCursor(
            session.id,
            serializeCursorState({ cursor: lastTweetId }),
            lastTweetId,
            pageCount,
              );

              if (options.maxPages && pageCount >= options.maxPages) {
                  console.log(
                    `\n[info] Reached max pages (${options.maxPages}). Stopping.`,
                  );
                  break;
              }

              await waitForPageDelay(options.delayMs);
            }
        }

      // Stop progress bar
      progressBar.stop();
      console.log(
        `[done] Scraping completed! Collected ${tweets.length} tweets from ${scrapedCount} processed.`,
      );

      if (lastTweetId) {
        const totalCollected = startingTotals.tweetsCollected + tweets.length;
        const computedPageCount = Math.max(
          pageCount,
          Math.floor(totalCollected / pageSize),
        );
        pageCount = computedPageCount;
        await sessionQueries.saveCursor(
          session.id,
          serializeCursorState({ cursor: lastTweetId }),
          lastTweetId,
          pageCount,
        );
      }

        // Save tweets to database (handle duplicates)
        if (tweetBatch.length > 0) {
            const saveStatus = new StatusLine();
            let savedCount = 0;
            let duplicateCount = 0;

            // Insert tweets with progress tracking
            for (let i = 0; i < tweetBatch.length; i++) {
              const tweet = tweetBatch[i];

              saveStatus.update(`[save] Saving tweets to database`, {
                  total: tweetBatch.length,
                  completed: i,
                  skipped: duplicateCount,
              });

              try {
                  // Check if tweet already exists
                  const existingTweet = await tweetQueries.tweetExists(tweet!.id);
                  if (existingTweet) {
                    duplicateCount++;
                    continue;
                  }

                  // Insert new tweet
                  await tweetQueries.insertTweets([tweet!]);
                  savedCount++;
              } catch (error) {
                  // If it's a duplicate constraint error, count as duplicate
                  if (
                    error instanceof Error &&
                    error.message.includes("UNIQUE constraint")
                  ) {
                    duplicateCount++;
                  } else {
                    console.error(`[error] Failed to save tweet ${tweet!.id}:`, error);
                  }
              }
            }

            saveStatus.done();
            console.log(
              `[ok] Successfully saved ${savedCount} new tweets to database`,
            );
            if (duplicateCount > 0) {
              console.log(`[info] Skipped ${duplicateCount} duplicate tweets`);
            }
        }
      } catch (scrapingError) {
        // Handle scraping loop errors with detailed error categorization
        console.error("[error] Error during scraping loop:", scrapingError);
        rateLimiter.recordRequest(false, undefined, scrapingError);

        // Check if it's a rate limit error and handle appropriately
        if (isRateLimitError(scrapingError)) {
            const rateLimitError = new RateLimitError(
              "Rate limit exceeded during tweet scraping",
              {
                  command: "scrape",
                  username,
                  operation: "tweet_iteration",
                  metadata: { scrapedCount, tweetsCollected: tweets.length },
              },
            );
            throw rateLimitError;
        }

        // Re-throw for main error handler
        throw scrapingError;
      }

      // Update session with final results
      await sessionQueries.updateSessionStatus(session.id, "completed", {
      tweetsCollected: startingTotals.tweetsCollected + tweets.length,
      totalProcessed: scrapedCount,
      contentFiltered: startingTotals.contentFiltered + filteredCount,
      keywordFiltered: startingTotals.keywordFiltered + keywordFilteredCount,
      dateFiltered: startingTotals.dateFiltered + dateFilteredCount,
      pageCount,
    });

    const totalFiltered =
      startingTotals.contentFiltered +
      startingTotals.keywordFiltered +
      startingTotals.dateFiltered +
      filteredCount +
      keywordFilteredCount +
      dateFilteredCount;
    const message = `[ok] Successfully scraped ${startingTotals.tweetsCollected + tweets.length} tweets from @${username}`;
      console.log(message);
      console.log(`[save] Saved to SQLite database`);
      console.log(`[stats] Statistics:`);
    console.log(
      `   • Total processed: ${scrapedCount}`,
    );
    console.log(
      `   • Content filtered: ${startingTotals.contentFiltered + filteredCount}`,
    );
    if (keywordFilteredCount > 0) {
      console.log(
        `   • Keyword filtered: ${startingTotals.keywordFiltered + keywordFilteredCount}`,
      );
    }
    if (dateFilteredCount > 0) {
      console.log(
        `   • Date filtered: ${startingTotals.dateFiltered + dateFilteredCount}`,
      );
    }
    console.log(`   • Total filtered: ${totalFiltered}`);
    console.log(
      `   • Final collected: ${startingTotals.tweetsCollected + tweets.length}`,
    );

      return {
        success: true,
        message,
        data: {
        tweetsCollected: startingTotals.tweetsCollected + tweets.length,
        totalProcessed: scrapedCount,
        contentFiltered: startingTotals.contentFiltered + filteredCount,
        keywordFiltered: startingTotals.keywordFiltered + keywordFilteredCount,
        dateFiltered: startingTotals.dateFiltered + dateFilteredCount,
        totalFiltered,
        sessionId: session.id,
        userId: user.id,
      },
    };
  } catch (error) {
    await sessionQueries.updateSessionStatus(session.id, "failed", {
      errorMessage:
        error instanceof Error ? error.message : "Unknown error occurred",
    });

    return handleCommandError(error, {
      command: "scrape",
      username,
      operation: "tweet_scraping",
    });
  }
}

// Legacy function for backward compatibility
export async function scrapeUser(username: string): Promise<CommandResult> {
  return scrapeCommand({ username });
}

async function resumeScrape(
  sessionId: number,
  options: ScrapingOptions,
): Promise<CommandResult> {
  const session = await sessionQueries.getSessionById(sessionId);
  if (!session) {
    return { success: false, message: `Scrape session ${sessionId} not found` };
  }

  if (session.status === "completed") {
    return {
      success: false,
      message: `Scrape session ${sessionId} is already completed`,
    };
  }

  const cursorData = await sessionQueries.getCursor(sessionId);
  if (!cursorData && !options.fresh && !options.cursor) {
    return {
      success: false,
      message: `No cursor saved for session ${sessionId}. Cannot resume.`,
    };
  }

  const user = await userQueries.getUserByUsername(session.username);
  if (!user) {
    return {
      success: false,
      message: `User @${session.username} not found for session ${sessionId}`,
    };
  }

  const includeReplies =
    session.includeReplies ??
    (session.contentType === "replies" || session.contentType === "both");
  const includeRetweets =
    session.includeRetweets ?? session.contentType === "both";
  const keywords = session.keywords
    ? (session.keywords as string[])
    : undefined;
  const dateRange = session.customDateRange
    ? (session.customDateRange as { start: Date; end: Date })
    : undefined;

  if (options.fresh) {
    await sessionQueries.updateSession(sessionId, {
      tweetsCollected: 0,
      totalProcessed: 0,
      contentFiltered: 0,
      keywordFiltered: 0,
      dateFiltered: 0,
      pageCount: 0,
    });
  }

  await sessionQueries.updateSession(sessionId, { status: "running" });

  console.log(`[resume] Resuming scrape session ${sessionId}...`);
  const parsedCursor = parseCursorState(cursorData?.cursor ?? null);
  if (parsedCursor?.cursor) {
    console.log(`[info] Saved cursor: ${redactCursor(parsedCursor.cursor)}`);
  }

  const resumeOptions: ScrapingOptions = {
    username: session.username,
    includeReplies,
    includeRetweets,
    keywords,
    dateRange: dateRange
      ? {
          start: new Date(dateRange.start),
          end: new Date(dateRange.end),
        }
      : undefined,
    maxTweets: session.maxTweets,
    rateLimitProfile: session.rateLimitProfile ?? "conservative",
    all: options.all,
    maxPages: options.maxPages,
    delayMs: options.delayMs,
    cursor:
      options.cursor ?? (options.fresh ? undefined : cursorData?.cursor),
    fresh: options.fresh,
  };

  return executeScrape(session, user, resumeOptions);
}
