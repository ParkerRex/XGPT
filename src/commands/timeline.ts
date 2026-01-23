import {
  Scraper,
  SearchMode,
  WaitingRateLimitStrategy,
  type RateLimitEvent,
  type RateLimitStrategy,
  type Tweet as ScraperTweet,
} from "@the-convocation/twitter-scraper";
import "dotenv/config";
import type { CommandResult } from "../types/common.js";
import type { NewTweet } from "../database/schema.js";
import {
  tweetQueries,
  userQueries,
  type TweetOriginMetadata,
} from "../database/queries.js";
import { handleCommandError, AuthenticationError } from "../errors/index.js";
import { parseUsername } from "../validation/schemas.js";
import { sleep } from "../utils/backoff.js";
import { parseTweetId } from "../utils/twitter.js";

const DEFAULT_MAX_TWEETS = 200;
const DEFAULT_PAGE_SIZE = 50;

interface TimelinePaginationOptions {
  maxTweets?: number;
  cursor?: string;
  maxPages?: number;
  all?: boolean;
  delayMs?: number;
}

interface TimelineCommandOptions extends TimelinePaginationOptions {
  json?: boolean;
  save?: boolean;
}

interface TimelineResultData {
  items: Array<Record<string, unknown>>;
  nextCursor?: string;
  stats: {
    total: number;
    saved: number;
    duplicates: number;
    originsUpdated: number;
    usersCreated: number;
    skipped: number;
  };
}

function normalizeTweetText(text?: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function buildBaseMetadata(tweet: ScraperTweet): Record<string, unknown> {
  return {
    isQuoted: tweet.isQuoted ?? false,
    quotedStatus: tweet.quotedStatus?.id ?? null,
    conversationId: tweet.conversationId ?? null,
    permanentUrl: tweet.permanentUrl ?? null,
    mentions: tweet.mentions?.map((mention) => mention.username) ?? [],
    hashtags: tweet.hashtags ?? [],
    urls: tweet.urls ?? [],
  };
}

function toDbTweet(
  tweet: ScraperTweet,
  userId: number,
  username: string,
): NewTweet {
  return {
    id: tweet.id!,
    text: normalizeTweetText(tweet.text),
    userId,
    username,
    createdAt: tweet.timeParsed ?? new Date(),
    isRetweet: tweet.isRetweet ?? false,
    isReply: tweet.isReply ?? false,
    likes: tweet.likes ?? 0,
    retweets: tweet.retweets ?? 0,
    replies: tweet.replies ?? 0,
    metadata: JSON.stringify(buildBaseMetadata(tweet)),
  };
}

function toOutputTweet(tweet: ScraperTweet): Record<string, unknown> {
  return {
    id: tweet.id,
    text: tweet.text ?? "",
    username: tweet.username ?? "unknown",
    createdAt: tweet.timeParsed?.toISOString() ?? null,
    url: tweet.permanentUrl ?? null,
    conversationId: tweet.conversationId ?? null,
    inReplyToStatusId: tweet.inReplyToStatusId ?? null,
    isReply: tweet.isReply ?? false,
    isRetweet: tweet.isRetweet ?? false,
    likes: tweet.likes ?? 0,
    retweets: tweet.retweets ?? 0,
    replies: tweet.replies ?? 0,
  };
}

function getTweetTimestamp(tweet: ScraperTweet): number {
  if (typeof tweet.timestamp === "number") return tweet.timestamp;
  if (tweet.timeParsed) return tweet.timeParsed.getTime();
  return 0;
}

function buildAuthCookies(): string[] {
  const authToken = process.env.AUTH_TOKEN;
  const ct0 = process.env.CT0;
  if (!authToken || !ct0) {
    throw new AuthenticationError(
      "Twitter authentication tokens are missing or invalid",
      {
        command: "timeline",
        operation: "authentication_check",
      },
    );
  }

  return [
    `auth_token=${authToken}; Path=/; Domain=.x.com; Secure; HttpOnly`,
    `ct0=${ct0}; Path=/; Domain=.x.com; Secure`,
  ];
}

async function createScraper(): Promise<Scraper> {
  const customRateLimitStrategy: RateLimitStrategy = {
    async onRateLimit(event: RateLimitEvent): Promise<void> {
      console.log(
        `\n[warn] Twitter API rate limit hit. Using library's built-in wait strategy...`,
      );
      const waitingStrategy = new WaitingRateLimitStrategy();
      await waitingStrategy.onRateLimit(event);
    },
  };

  const scraper = new Scraper({
    rateLimitStrategy: customRateLimitStrategy,
    experimental: {
      xClientTransactionId: true,
      xpff: true,
    },
  });
  await scraper.setCookies(buildAuthCookies());
  return scraper;
}

async function fetchSearchPages(options: {
  scraper: Scraper;
  query: string;
  searchMode?: SearchMode;
  pagination: TimelinePaginationOptions;
  filter?: (tweet: ScraperTweet) => boolean;
}): Promise<{
  tweets: ScraperTweet[];
  nextCursor?: string;
  totalProcessed: number;
}> {
  const {
    scraper,
    query,
    searchMode = SearchMode.Latest,
    pagination,
    filter,
  } = options;
  const requestedMax =
    pagination.maxTweets === undefined || !Number.isFinite(pagination.maxTweets)
      ? DEFAULT_MAX_TWEETS
      : pagination.maxTweets;
  const maxTweets = pagination.all ? Number.POSITIVE_INFINITY : requestedMax;
  const maxPages =
    pagination.maxPages === undefined || !Number.isFinite(pagination.maxPages)
      ? Number.POSITIVE_INFINITY
      : pagination.maxPages;
  let cursor = pagination.cursor;

  const collected: ScraperTweet[] = [];
  const seen = new Set<string>();
  let totalProcessed = 0;

  for (let page = 0; page < maxPages; page++) {
    const remaining = Number.isFinite(maxTweets)
      ? Math.max(0, maxTweets - collected.length)
      : DEFAULT_PAGE_SIZE;
    if (remaining === 0) break;

    const pageSize = Math.min(DEFAULT_PAGE_SIZE, remaining);
    const response = await scraper.fetchSearchTweets(
      query,
      pageSize,
      searchMode,
      cursor,
    );
    const pageTweets = response.tweets ?? [];
    totalProcessed += pageTweets.length;

    for (const tweet of pageTweets) {
      if (!tweet.id || seen.has(tweet.id)) continue;
      seen.add(tweet.id);
      if (filter && !filter(tweet)) continue;
      collected.push(tweet);
      if (collected.length >= maxTweets) break;
    }

    cursor = response.next;
    if (!cursor) break;
    if (pagination.delayMs) {
      await sleep(pagination.delayMs);
    }
  }

  return { tweets: collected, nextCursor: cursor, totalProcessed };
}

async function persistTweets(
  tweets: ScraperTweet[],
  originBase: Omit<TweetOriginMetadata, "fetchedAt">,
  save = true,
): Promise<TimelineResultData["stats"]> {
  const stats = {
    total: tweets.length,
    saved: 0,
    duplicates: 0,
    originsUpdated: 0,
    usersCreated: 0,
    skipped: 0,
  };

  if (!save) return stats;

  for (const tweet of tweets) {
    if (!tweet.id || !tweet.text) {
      stats.skipped++;
      continue;
    }

    const username = tweet.username ?? "unknown";
    const user = await userQueries.upsertUser(username, tweet.name ?? undefined);
    if (user.createdAt && user.createdAt.getTime() > Date.now() - 1000) {
      stats.usersCreated++;
    }

    const dbTweet = toDbTweet(tweet, user.id, username);
    const origin: TweetOriginMetadata = {
      ...originBase,
      fetchedAt: new Date().toISOString(),
    };
    const result = await tweetQueries.upsertTweetWithOrigin(dbTweet, origin);
    if (result.inserted) {
      stats.saved++;
    } else {
      stats.duplicates++;
    }
    if (result.originUpdated) {
      stats.originsUpdated++;
    }
  }

  return stats;
}

function formatTimelineResult(
  label: string,
  items: ScraperTweet[],
  stats: TimelineResultData["stats"],
  nextCursor?: string,
  json = false,
): CommandResult<TimelineResultData> {
  const data: TimelineResultData = {
    items: items.map(toOutputTweet),
    nextCursor,
    stats,
  };

  if (json) {
    return { success: true, message: `${label} completed`, data };
  }

  const message = `[ok] ${label}: ${stats.saved} new, ${stats.duplicates} duplicates`;
  console.log(message);
  if (nextCursor) {
    console.log(`[info] next cursor: ${nextCursor}`);
  }
  return { success: true, message, data };
}

export async function readCommand(
  input: string,
  options: TimelineCommandOptions = {},
): Promise<CommandResult<TimelineResultData>> {
  const save = options.save ?? true;
  try {
    const tweetId = parseTweetId(input);
    if (!tweetId) {
      return { success: false, message: "Invalid tweet ID or URL" };
    }

    const scraper = await createScraper();
    const tweet = await scraper.getTweet(tweetId);
    if (!tweet) {
      return { success: false, message: `Tweet ${tweetId} not found` };
    }

    const originBase = {
      command: "read",
      input,
      cursor: options.cursor,
    };
    const stats = await persistTweets([tweet], originBase, save);
    return formatTimelineResult(
      "Read tweet",
      [tweet],
      stats,
      undefined,
      options.json,
    );
  } catch (error) {
    return handleCommandError(error, {
      command: "read",
      operation: "tweet_read",
    });
  }
}

export async function threadCommand(
  input: string,
  options: TimelineCommandOptions = {},
): Promise<CommandResult<TimelineResultData>> {
  const save = options.save ?? true;
  try {
    const tweetId = parseTweetId(input);
    if (!tweetId) {
      return { success: false, message: "Invalid tweet ID or URL" };
    }

    const scraper = await createScraper();
    const rootTweet = await scraper.getTweet(tweetId);
    if (!rootTweet) {
      return { success: false, message: `Tweet ${tweetId} not found` };
    }

    const username = rootTweet.username;
    if (!username) {
      return { success: false, message: "Tweet author not available" };
    }

    const conversationId = rootTweet.conversationId ?? rootTweet.id ?? tweetId;
    const query = `conversation_id:${conversationId} from:${username}`;

    const { tweets, nextCursor } = await fetchSearchPages({
      scraper,
      query,
      pagination: options,
      filter: (tweet) => tweet.conversationId === conversationId,
    });

    const threadTweets = tweets.some((t) => t.id === rootTweet.id)
      ? tweets
      : [rootTweet, ...tweets];

    threadTweets.sort((a, b) => getTweetTimestamp(a) - getTweetTimestamp(b));

    const originBase = {
      command: "thread",
      input,
      cursor: options.cursor,
    };
    const stats = await persistTweets(threadTweets, originBase, save);
    return formatTimelineResult(
      "Thread fetch",
      threadTweets,
      stats,
      nextCursor,
      options.json,
    );
  } catch (error) {
    return handleCommandError(error, {
      command: "thread",
      operation: "thread_fetch",
    });
  }
}

export async function repliesCommand(
  input: string,
  options: TimelineCommandOptions = {},
): Promise<CommandResult<TimelineResultData>> {
  const save = options.save ?? true;
  try {
    const tweetId = parseTweetId(input);
    if (!tweetId) {
      return { success: false, message: "Invalid tweet ID or URL" };
    }

    const scraper = await createScraper();
    const rootTweet = await scraper.getTweet(tweetId);
    if (!rootTweet) {
      return { success: false, message: `Tweet ${tweetId} not found` };
    }

    const conversationId = rootTweet.conversationId ?? rootTweet.id ?? tweetId;
    const query = `conversation_id:${conversationId}`;

    const { tweets, nextCursor } = await fetchSearchPages({
      scraper,
      query,
      pagination: options,
      filter: (tweet) => tweet.inReplyToStatusId === tweetId,
    });

    const replyTweets = tweets.sort(
      (a, b) => getTweetTimestamp(a) - getTweetTimestamp(b),
    );

    const originBase = {
      command: "replies",
      input,
      cursor: options.cursor,
    };
    const stats = await persistTweets(replyTweets, originBase, save);
    return formatTimelineResult(
      "Replies fetch",
      replyTweets,
      stats,
      nextCursor,
      options.json,
    );
  } catch (error) {
    return handleCommandError(error, {
      command: "replies",
      operation: "replies_fetch",
    });
  }
}

export async function userTweetsCommand(
  usernameInput: string,
  options: TimelineCommandOptions & {
    includeReplies?: boolean;
    includeRetweets?: boolean;
  } = {},
): Promise<CommandResult<TimelineResultData>> {
  const save = options.save ?? true;
  try {
    const username = parseUsername(usernameInput);
    const scraper = await createScraper();
    const query = `from:${username}`;

    const includeReplies = options.includeReplies ?? false;
    const includeRetweets = options.includeRetweets ?? false;

    const { tweets, nextCursor } = await fetchSearchPages({
      scraper,
      query,
      pagination: options,
      filter: (tweet) => {
        if (!includeReplies && tweet.isReply) return false;
        if (!includeRetweets && tweet.isRetweet) return false;
        return true;
      },
    });

    const ordered = tweets.sort(
      (a, b) => getTweetTimestamp(a) - getTweetTimestamp(b),
    );

    const originBase = {
      command: "user-tweets",
      input: username,
      cursor: options.cursor,
    };
    const stats = await persistTweets(ordered, originBase, save);
    return formatTimelineResult(
      `User timeline @${username}`,
      ordered,
      stats,
      nextCursor,
      options.json,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid username")) {
      return { success: false, message: error.message };
    }
    return handleCommandError(error, {
      command: "user-tweets",
      operation: "user_timeline_fetch",
    });
  }
}

export async function mentionsCommand(
  options: TimelineCommandOptions & { user?: string } = {},
): Promise<CommandResult<TimelineResultData>> {
  const save = options.save ?? true;
  try {
    const usernameInput =
      options.user ??
      process.env.XGPT_USERNAME ??
      process.env.TWITTER_USERNAME;
    if (!usernameInput) {
      return {
        success: false,
        message:
          "Missing username. Provide --user or set XGPT_USERNAME/TWITTER_USERNAME.",
      };
    }

    const username = parseUsername(usernameInput);
    const scraper = await createScraper();
    const query = `@${username}`;

    const { tweets, nextCursor } = await fetchSearchPages({
      scraper,
      query,
      pagination: options,
    });

    const ordered = tweets.sort(
      (a, b) => getTweetTimestamp(a) - getTweetTimestamp(b),
    );

    const originBase = {
      command: "mentions",
      input: username,
      cursor: options.cursor,
    };
    const stats = await persistTweets(ordered, originBase, save);
    return formatTimelineResult(
      `Mentions for @${username}`,
      ordered,
      stats,
      nextCursor,
      options.json,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid username")) {
      return { success: false, message: error.message };
    }
    return handleCommandError(error, {
      command: "mentions",
      operation: "mentions_fetch",
    });
  }
}
