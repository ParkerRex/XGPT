/**
 * Search utilities for building Twitter search queries
 */

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Parse comma-separated variants
 * "AGI, GPT-5, foundation models" => ["AGI", "GPT-5", "foundation models"]
 */
export function parseSearchVariants(input: string): string[] {
  return input
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Build Twitter search query
 * ["AGI", "GPT-5"] + 7 days => "\"AGI\" OR \"GPT-5\" since:2024-12-22 -filter:retweets"
 */
export function buildTwitterQuery(
  variants: string[],
  dateRange?: DateRange,
): string {
  const quoted = variants.map((v) => `"${v}"`);
  let query = quoted.join(" OR ");

  if (dateRange) {
    // Convert to UTC for Twitter
    query += ` since:${formatDateUTC(dateRange.start)} until:${formatDateUTC(dateRange.end)}`;
  }

  query += " -filter:retweets";
  return query;
}

/**
 * Calculate date range from options (local timezone)
 */
export function calculateSearchDateRange(
  days?: number,
  since?: string,
  until?: string,
): DateRange | null {
  if (days !== undefined && (since || until)) {
    throw new Error(
      "Cannot use --days with --since/--until. Choose one date method.",
    );
  }

  if (days !== undefined) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
  }

  if (since || until) {
    const start = since ? parseLocalDate(since) : new Date(0);
    const end = until ? parseLocalDate(until) : new Date();
    return { start, end };
  }

  return null;
}

/**
 * Determine which variant matched a tweet (first/longest match wins)
 */
export function matchVariant(text: string, variants: string[]): string | null {
  const lower = text.toLowerCase();
  // Sort by length descending - longer = more specific
  const sorted = [...variants].sort((a, b) => b.length - a.length);
  return sorted.find((v) => lower.includes(v.toLowerCase())) || null;
}

/**
 * Split query into multiple queries if it exceeds Twitter's limit
 * Twitter has a ~500 character query limit
 */
export function splitQuery(
  variants: string[],
  maxLength: number = 450,
): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;

  // Account for base query overhead: " -filter:retweets" + potential date filters
  const overhead = 100; // Reserve space for filters

  for (const variant of variants) {
    const addition = `"${variant}" OR `.length;
    if (currentLength + addition > maxLength - overhead && current.length > 0) {
      groups.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(variant);
    currentLength += addition;
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Format date for Twitter (UTC) - YYYY-MM-DD
 */
function formatDateUTC(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Parse date string as local timezone
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

/**
 * Parse duration string (e.g., "30d") to days
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)d$/);
  if (!match) {
    throw new Error(
      'Invalid duration format. Use format like "30d" for 30 days.',
    );
  }
  return parseInt(match[1]!, 10);
}

/**
 * Format a date range for display
 */
export function formatDateRangeDisplay(dateRange: DateRange): string {
  const formatOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  const startStr = dateRange.start.toLocaleDateString("en-US", formatOptions);
  const endStr = dateRange.end.toLocaleDateString("en-US", formatOptions);

  return `${startStr} to ${endStr}`;
}

/**
 * Check if a rate limit error occurred
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("429")
    );
  }
  return false;
}

/**
 * Wait for rate limit reset
 */
export async function waitForRateLimitReset(
  error: unknown,
  defaultWaitMs: number = 60000,
): Promise<void> {
  let waitMs = defaultWaitMs;

  // Try to extract reset time from error
  if (error instanceof Error && error.message.includes("retry after")) {
    const match = error.message.match(/retry after (\d+)/);
    if (match) {
      waitMs = parseInt(match[1]!, 10) * 1000;
    }
  }

  console.log(
    `Waiting ${Math.ceil(waitMs / 1000)} seconds for rate limit reset...`,
  );
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
