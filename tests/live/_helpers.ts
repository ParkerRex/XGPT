import { beforeAll, describe, it } from "bun:test";
import { Scraper, SearchMode } from "@the-convocation/twitter-scraper";

export const LIVE_ENABLED = process.env.XGPT_LIVE === "1";
export const HAS_AUTH = Boolean(process.env.AUTH_TOKEN && process.env.CT0);

export const describeLive = LIVE_ENABLED ? describe : describe.skip;
export const itLive = LIVE_ENABLED ? it : it.skip;
export const itAuthLive = LIVE_ENABLED && HAS_AUTH ? it : it.skip;

const MAX_LIVE_ITEMS = 5;
const DEFAULT_LIVE_LIMIT = 1;

beforeAll(() => {
  if (!LIVE_ENABLED) return;

  console.log("[live] Live tests enabled. Network requests will be made.");
  if (!HAS_AUTH) {
    console.log("[live] Missing AUTH_TOKEN/CT0. Auth-required tests will be skipped.");
  }
});

export function getLiveLimit(): number {
  const raw = process.env.XGPT_LIVE_MAX ?? String(DEFAULT_LIVE_LIMIT);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIVE_LIMIT;
  return Math.min(parsed, MAX_LIVE_ITEMS);
}

export function getLiveQuery(): string {
  return process.env.XGPT_LIVE_QUERY ?? "from:TwitterDev";
}

export function getLiveUser(): string {
  return process.env.XGPT_LIVE_USER ?? "elonmusk";
}

export function authFailureHint(error: unknown): Error {
  const base = error instanceof Error ? error.message : String(error);
  return new Error(
    `${base}\n\nSuggested remediation:\n- Run: xgpt auth check\n- Refresh query IDs: xgpt query-ids --fresh\n- Retry with a lower limit or add delay`,
  );
}

export function assertBasicTweet(tweet: unknown): void {
  if (!tweet || typeof tweet !== "object") {
    throw new Error("Tweet is missing or invalid");
  }
  const record = tweet as Record<string, unknown>;
  if (!record.id) throw new Error("Tweet missing id");
  if (!record.text) throw new Error("Tweet missing text");
  const hasTimestamp =
    Boolean(record.timeParsed) ||
    Boolean(record.createdAt) ||
    Boolean(record.created_at);
  if (!hasTimestamp) {
    throw new Error("Tweet missing timestamp");
  }
}

export async function createLiveScraper(): Promise<Scraper> {
  if (!HAS_AUTH) {
    throw new Error("Missing AUTH_TOKEN/CT0 for live tests");
  }

  const cookies = [
    `auth_token=${process.env.AUTH_TOKEN}; Path=/; Domain=.x.com; Secure; HttpOnly`,
    `ct0=${process.env.CT0}; Path=/; Domain=.x.com; Secure`,
  ];

  const scraper = new Scraper({
    experimental: {
      xClientTransactionId: true,
      xpff: true,
    },
  });

  await scraper.setCookies(cookies);
  return scraper;
}

export async function getFirstSearchTweet(scraper: Scraper, query: string) {
  const limit = getLiveLimit();
  const iterator = scraper.searchTweets(query, limit, SearchMode.Latest);
  for await (const tweet of iterator) {
    return tweet;
  }
  return null;
}

export async function getFirstUserTweet(scraper: Scraper, username: string) {
  const limit = getLiveLimit();
  const iterator = scraper.getTweets(username, limit);
  for await (const tweet of iterator) {
    return tweet;
  }
  return null;
}
