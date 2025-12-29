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
  userQueries,
  tweetQueries,
  sessionQueries,
} from "../database/queries.js";
import type { NewTweet, NewScrapeSession } from "../database/schema.js";
import { RateLimitManager } from "../rateLimit/manager.js";
import {
  RATE_LIMIT_PROFILES,
  getRateLimitProfile,
  isRateLimitError,
} from "../rateLimit/config.js";
import { TweetEstimator } from "../rateLimit/estimator.js";
import {
  handleCommandError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  DatabaseError,
  NetworkError,
  ErrorCategory,
} from "../errors/index.js";
import {
  createProgressBar,
  ProgressPresets,
  withSpinner,
  StatusLine,
} from "../ui/index.js";

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
  } = options;

  try {
    console.log(`🐦 Starting to scrape tweets from @${username}...`);

    // Create or update user in database
    console.log(`👤 Setting up user @${username} in database...`);
    const user = await userQueries.upsertUser(username, username);
    console.log(`✅ User @${username} ready (ID: ${user.id})`);

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
      status: "running",
    };

    const session = await sessionQueries.createSession(sessionData);
    console.log(`📊 Created scrape session (ID: ${session.id})`);

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
      `🛡️  Rate limiting active: ${profile.name} profile (${profile.description})`,
    );
    console.log(
      `⚡ Rate: ${profile.requestsPerMinute} requests/min, ${profile.requestsPerHour} requests/hour`,
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
          `\n⚠️  Twitter API rate limit hit. Using library's built-in wait strategy...`,
        );
        // Delegate to the library's waiting strategy
        const waitingStrategy = new WaitingRateLimitStrategy();
        await waitingStrategy.onRateLimit(event);
      },
    };

    // Initialize scraper with library's rate limit handling and experimental features
    const scraper = new Scraper({
      rateLimitStrategy: customRateLimitStrategy,
      experimental: {
        xClientTransactionId: true, // May help avoid detection
        xpff: true, // May help avoid detection
      },
    });
    await scraper.setCookies(cookies);

    // Show active filters
    console.log(`📊 Active filters:`);
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
    let scrapedCount = 0;
    let filteredCount = 0;
    let keywordFilteredCount = 0;
    let dateFilteredCount = 0;
    let rateLimitDelays = 0;
    const tweets: Tweet[] = [];
    const tweetBatch: NewTweet[] = [];
    const startTime = Date.now();

    // Create progress bar with rate limit awareness
    const progressBar = createProgressBar(ProgressPresets.scraping(username));
    progressBar.start(maxTweets);

    try {
      // Use library's getTweetsAndReplies() when replies are requested
      // This is more efficient than filtering manually
      const tweetIterator = includeReplies
        ? scraper.getTweetsAndReplies(username, maxTweets)
        : scraper.getTweets(username, maxTweets);

      for await (const tweet of tweetIterator) {
        // Apply rate limiting before processing each tweet
        try {
          await rateLimiter.waitForPermission();
          rateLimiter.recordRequest(true); // Record successful request
        } catch (error) {
          rateLimitDelays++;
          rateLimiter.recordRequest(false, undefined, error);

          // Update progress bar to show delay
          progressBar.update(tweets.length, {
            processed: scrapedCount,
            delays: rateLimitDelays,
          });

          // Check if we should pause scraping
          if (rateLimiter.shouldPauseScraping()) {
            console.log(
              "\n⚠️  Too many rate limit errors. Pausing scraping for account safety.",
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
          if (!matchesKeywords(tweet.text || "", keywords)) {
            keywordFilteredCount++;
            continue;
          }
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
          createdAt: tweet.timeParsed || new Date(),
          isRetweet: tweet.isRetweet || false,
          isReply: tweet.isReply || false,
          likes: tweet.likes || 0,
          retweets: tweet.retweets || 0,
          replies: tweet.replies || 0,
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

        // Update progress bar
        progressBar.update(tweets.length, {
          processed: scrapedCount,
          delays: rateLimitDelays,
          errors: 0,
          skipped: filteredCount + keywordFilteredCount + dateFilteredCount,
        });

        if (tweets.length >= maxTweets) {
          progressBar.update(maxTweets, {
            processed: scrapedCount,
            delays: rateLimitDelays,
            errors: 0,
            skipped: filteredCount + keywordFilteredCount + dateFilteredCount,
          });
          break;
        }
      }

      // Stop progress bar
      progressBar.stop();
      console.log(
        `🎯 Scraping completed! Collected ${tweets.length} tweets from ${scrapedCount} processed.`,
      );

      // Save tweets to database (handle duplicates)
      if (tweetBatch.length > 0) {
        const saveStatus = new StatusLine();
        let savedCount = 0;
        let duplicateCount = 0;

        // Insert tweets with progress tracking
        for (let i = 0; i < tweetBatch.length; i++) {
          const tweet = tweetBatch[i];

          saveStatus.update(`💾 Saving tweets to database`, {
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
              console.error(`❌ Failed to save tweet ${tweet!.id}:`, error);
            }
          }
        }

        saveStatus.done();
        console.log(
          `✅ Successfully saved ${savedCount} new tweets to database`,
        );
        if (duplicateCount > 0) {
          console.log(`ℹ️  Skipped ${duplicateCount} duplicate tweets`);
        }
      }
    } catch (scrapingError) {
      // Handle scraping loop errors with detailed error categorization
      console.error("❌ Error during scraping loop:", scrapingError);
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
      tweetsCollected: tweets.length,
      totalProcessed: scrapedCount,
      contentFiltered: filteredCount,
      keywordFiltered: keywordFilteredCount,
      dateFiltered: dateFilteredCount,
    });

    const totalFiltered =
      filteredCount + keywordFilteredCount + dateFilteredCount;
    const message = `✅ Successfully scraped ${tweets.length} tweets from @${username}`;
    console.log(message);
    console.log(`💾 Saved to SQLite database`);
    console.log(`📊 Statistics:`);
    console.log(`   • Total processed: ${scrapedCount}`);
    console.log(`   • Content filtered: ${filteredCount}`);
    if (keywordFilteredCount > 0) {
      console.log(`   • Keyword filtered: ${keywordFilteredCount}`);
    }
    if (dateFilteredCount > 0) {
      console.log(`   • Date filtered: ${dateFilteredCount}`);
    }
    console.log(`   • Total filtered: ${totalFiltered}`);
    console.log(`   • Final collected: ${tweets.length}`);

    return {
      success: true,
      message,
      data: {
        tweetsCollected: tweets.length,
        totalProcessed: scrapedCount,
        contentFiltered: filteredCount,
        keywordFiltered: keywordFilteredCount,
        dateFiltered: dateFilteredCount,
        totalFiltered,
        sessionId: session.id,
        userId: user.id,
      },
    };
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
      console.error("❌ Failed to update session status:", sessionError);
    }

    // Use comprehensive error handling
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
