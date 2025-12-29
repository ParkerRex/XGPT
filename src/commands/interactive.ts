import { input, confirm, select } from "@inquirer/prompts";
import {
  promptContentType,
  getContentTypeFilters,
} from "../prompts/contentType.js";
import { promptSearchScope } from "../prompts/searchScope.js";
import { promptTimeRange } from "../prompts/timeRange.js";
import { scrapeCommand } from "./scrape.js";
import { embedCommand } from "./embed.js";
import type { SessionConfig, PromptSession } from "../types/session.js";
import type { CommandResult } from "../types/common.js";
import {
  calculateDateRange,
  formatDateRange,
  getRelativeTimeDescription,
} from "../utils/dateUtils.js";
import {
  RATE_LIMIT_PROFILES,
  getAvailableProfiles,
} from "../rateLimit/config.js";
import { TweetEstimator } from "../rateLimit/estimator.js";
import { loadConfig } from "../config/manager.js";
import { handleCommandError } from "../errors/index.js";

export async function interactiveCommand(
  username?: string,
): Promise<CommandResult> {
  try {
    console.log("\n[start] Welcome to X-GPT Interactive Mode!");
    console.log("Let's configure your tweet scraping session step by step.\n");

    // Load user configuration for defaults
    const userConfig = await loadConfig();
    console.log(`[list] Using saved preferences from: ~/.xgpt/config.json`);
    console.log(
      `[tip] Tip: Use 'xgpt config list' to view/modify your defaults\n`,
    );

    // Initialize session
    const session: PromptSession = {
      config: {},
      step: "content-type",
      startTime: new Date(),
      username,
    };

    // Step 1: Get username if not provided
    if (!username) {
      console.log("[user] User Selection");
      session.username = await input({
        message: "Enter the Twitter/X username to scrape (without @):",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Please enter a username";
          }
          if (input.startsWith("@")) {
            return "Please enter username without the @ symbol";
          }
          if (!/^[a-zA-Z0-9_]+$/.test(input)) {
            return "Username can only contain letters, numbers, and underscores";
          }
          return true;
        },
      });
      console.log(`\n[ok] Target user: @${session.username}\n`);
    }

    // Step 2: Content type selection
    session.step = "content-type";
    // Map config content type to session content type
    const defaultContentType = userConfig.scraping.includeReplies
      ? userConfig.scraping.includeRetweets
        ? "both"
        : "replies"
      : "tweets";
    session.config.contentType = await promptContentType(defaultContentType);

    // Step 3: Search scope selection
    session.step = "search-scope";
    const scopeResult = await promptSearchScope(
      userConfig.scraping.defaultKeywords,
    );
    session.config.searchScope = scopeResult.searchScope;
    session.config.keywords = scopeResult.keywords;

    // Step 4: Time range selection
    session.step = "time-range";
    const timeResult = await promptTimeRange(
      userConfig.scraping.defaultTimeRange as
        | "lifetime"
        | "week"
        | "month"
        | "3months"
        | "6months"
        | "year"
        | "custom"
        | undefined,
    );
    session.config.timeRange = timeResult.timeRange;
    session.config.customDateRange = timeResult.customDateRange;

    // Step 5: Additional options
    console.log("\n⚙️  Additional Options");

    const maxTweets = await input({
      message: "Maximum number of tweets to scrape:",
      default: userConfig.scraping.maxTweets.toString(),
      validate: (input: string) => {
        const num = parseInt(input);
        if (isNaN(num) || num <= 0) {
          return "Please enter a positive number";
        }
        if (num > 50000) {
          return "Maximum limit is 50,000 tweets";
        }
        return true;
      },
    });

    // Rate limiting profile selection
    console.log("\n[rate] Rate Limiting Profile");
    console.log(
      "Choose how aggressively to scrape (affects speed vs account safety):",
    );

    const rateLimitProfile = await select({
      message: "Select rate limiting profile:",
      choices: getAvailableProfiles().map((profileName) => {
        const profile = RATE_LIMIT_PROFILES[profileName];
        const estimate = TweetEstimator.estimateCollectionTime(
          parseInt(maxTweets),
          profile!,
        );
        return {
          name: `${profile!.name} - ${profile!.description} (${estimate.estimatedMinutes}min for ${maxTweets} tweets)`,
          value: profileName,
          description: `${profile!.riskLevel.toUpperCase()} RISK - ${profile!.requestsPerMinute} req/min`,
        };
      }),
      default: userConfig.scraping.rateLimitProfile,
    });

    const generateEmbeddings = await confirm({
      message: "Generate embeddings after scraping? (Required for Q&A)",
      default: userConfig.embedding.autoGenerate,
    });

    session.config.maxTweets = parseInt(maxTweets);
    session.config.rateLimitProfile = rateLimitProfile;
    session.config.generateEmbeddings = generateEmbeddings;

    // Step 6: Configuration summary and confirmation
    session.step = "confirmation";
    showConfigurationSummary(session);

    const confirmed = await confirm({
      message: "Start scraping with this configuration?",
      default: true,
    });

    if (!confirmed) {
      console.log("\n[error] Operation cancelled by user");
      return {
        success: false,
        message: "Operation cancelled",
        error: "User chose not to proceed",
      };
    }

    // Step 7: Execute scraping
    session.step = "processing";
    console.log("\n[start] Starting scraping process...\n");

    const result = await executeScraping(session);
    return result;
  } catch (error) {
    // Use enhanced error handling
    return handleCommandError(error, {
      command: "interactive",
      operation: "interactive_session",
      timestamp: new Date(),
    });
  }
}

function showConfigurationSummary(session: PromptSession): void {
  console.log("\n" + "=".repeat(60));
  console.log("[list] CONFIGURATION SUMMARY");
  console.log("=".repeat(60));

  console.log(`[user] User: @${session.username}`);
  console.log(
    `📝 Content: ${getContentTypeDescription(session.config.contentType!)}`,
  );
  console.log(`[search] Scope: ${getScopeDescription(session.config)}`);
  console.log(`[date] Time: ${getTimeDescription(session.config)}`);
  console.log(
    `[stats] Limit: ${session.config.maxTweets?.toLocaleString()} tweets max`,
  );
  console.log(
    `[rate] Rate Limit: ${getRateLimitDescription(session.config.rateLimitProfile!)}`,
  );
  console.log(
    `[embed] Embeddings: ${session.config.generateEmbeddings ? "Yes" : "No"}`,
  );

  console.log("=".repeat(60));
}

async function executeScraping(session: PromptSession): Promise<CommandResult> {
  const config = session.config;
  const filters = getContentTypeFilters(config.contentType!);

  // Calculate date range for filtering
  let dateRange: { start: Date; end: Date } | undefined;
  if (config.timeRange !== "lifetime") {
    dateRange =
      config.timeRange === "custom"
        ? config.customDateRange!
        : calculateDateRange(config.timeRange!);
  }

  // Execute scraping
  const scrapeResult = await scrapeCommand({
    username: session.username!,
    includeReplies: filters.includeReplies,
    includeRetweets: filters.includeRetweets,
    maxTweets: config.maxTweets!,
    keywords: config.keywords,
    dateRange,
    rateLimitProfile: config.rateLimitProfile ?? "conservative",
  });

  if (!scrapeResult.success) {
    return scrapeResult;
  }

  // Generate embeddings if requested
  if (config.generateEmbeddings) {
    console.log("\n[embed] Generating embeddings...");
    const embedResult = await embedCommand();

    if (!embedResult.success) {
      console.log("\n[warn] Scraping completed but embedding generation failed");
      console.log("You can generate embeddings later with: xgpt embed");
    } else {
      console.log("\n[ok] Embeddings generated successfully!");
    }
  }

  console.log("\n[success] Interactive session completed successfully!");
  console.log("\nNext steps:");
  console.log(
    '• Ask questions: xgpt ask "What does this person think about AI?"',
  );
  console.log("• View scraped data: cat tweets.json");
  if (config.generateEmbeddings) {
    console.log("• View embeddings: cat vectors.json");
  }

  return {
    success: true,
    message: "Interactive session completed successfully",
    data: {
      session: session.config,
      scrapeResult: scrapeResult.data,
    },
  };
}

function getContentTypeDescription(
  contentType: SessionConfig["contentType"],
): string {
  switch (contentType) {
    case "tweets":
      return "Tweets only";
    case "replies":
      return "Replies only";
    case "both":
      return "Tweets and replies";
    default:
      return "Unknown";
  }
}

function getScopeDescription(config: Partial<SessionConfig>): string {
  if (config.searchScope === "keywords" && config.keywords) {
    return `Keywords: ${config.keywords.join(", ")}`;
  }
  return "All posts";
}

function getTimeDescription(config: Partial<SessionConfig>): string {
  if (config.timeRange === "custom" && config.customDateRange) {
    return formatDateRange(
      config.customDateRange.start,
      config.customDateRange.end,
    );
  }
  return getRelativeTimeDescription(config.timeRange!);
}

function getRateLimitDescription(profileName: string): string {
  const profile = RATE_LIMIT_PROFILES[profileName];
  if (!profile) return "Unknown";

  const riskEmoji =
    profile.riskLevel === "low"
      ? "🟢"
      : profile.riskLevel === "medium"
        ? "🟡"
        : "🔴";
  return `${profile.name} ${riskEmoji} (${profile.requestsPerMinute} req/min)`;
}
